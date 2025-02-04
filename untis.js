require('dotenv').config();

const { parse, startOfDay } = require('date-fns');
const WebUntis = require('webuntis');
const google = require('./google');
const logger = require('./logger');
const push = require(`./pushsafer`);

const untisAPI = new WebUntis(process.env.SCHOOL, process.env.WEBUSER, process.env.PASSWORD, process.env.WEBURL);

const classes = process.env.CLASSES.split(", ");
if (classes != '') {
	console.log('Running with classes:', classes);
} else {
	console.log('Running with all classes');
}

module.exports.validateSession = async () => {
	return await untisAPI.validateSession();
}

/* Debug Method
module.exports.getTimetableForToday = async () => {
	try {	
		if(untisAPI.validateSession() == false) {
			return await this.getTimetableForToday();
		}

		await untisAPI.login();
	    
		let timetable = await untisAPI.getOwnClassTimetableForToday();

		let cTimetable = [];

		for(const val of timetable) {
			let subj = val.su[0];
			if(subj) {
				if(classes.includes(subj.name)) {
					cTimetable.push(val);
				}
			}
		}

		await untisAPI.logout();
		cTimetable.sort((a, b) => a.startTime - b.starTime);
		
		return cTimetable;
	}catch(err) {
		console.log(err);
		logger.error(err, {time: `${new Date()}`});
	}
};
 */

module.exports.getTimetableFor = async (date) => {
	try {
		if (untisAPI.validateSession() == false) {
			await untisAPI.logout();
			return await this.getTimetableFor(date);
		}

		await untisAPI.login();

		let timetable = await untisAPI.getOwnClassTimetableFor(date);

		let cTimetable = [];

		for (const val of timetable) {
			let subj = val.su[0];
			if (subj) {
				if (classes != '') {
					if (classes.includes(subj.name)) {
						cTimetable.push(val);
					}
				} else {
					cTimetable.push(val);
				}
			}
		}

		await untisAPI.logout();
		cTimetable.sort((a, b) => a.startTime - b.starTime);

		return cTimetable;
	} catch (err) {
		console.log(err);
		logger.error(err, { time: `${new Date()}` });
	}
};

module.exports.getTimetable = async () => {
	try {
		if (untisAPI.validateSession() == false) {
			await untisAPI.logout();
			return await this.getTimetable();
		}

		await untisAPI.login();

		let date = new Date();
		let cTimetable = [];

		// eslint-disable-next-line no-constant-condition
		while (true) {
			try {
				let timetable = await untisAPI.getOwnClassTimetableFor(date);

				for (const val of timetable) {
					let subj = val.su[0];
					if (subj) {
						if (classes != '') {
							if (classes.includes(subj.name)) {
								cTimetable.push(val);
							}
						} else {
							cTimetable.push(val);
						}
					}
				}

				date.setDate(date.getDate() + 1);
			} catch (err) {
				if (err.message == 'Server didn\'t return any result.') {
					break;
				} else {
					console.log(err);
					logger.error(err, { time: `${new Date()}` });
					break;
				}
			} finally {
				process.stdout.write(`Gathered ${cTimetable.length} timetables.\r`);
			}
		}

		logger.info(`Gathered ${cTimetable.length} timetables.`, { time: `${new Date()}` });
		console.log('');

		await untisAPI.logout();
		cTimetable.sort((a, b) => a.startTime - b.starTime);

		return cTimetable;
	} catch (err) {
		console.log(err);
		logger.error(err, { time: `${new Date()}` });
	}
};

module.exports.convertAndInsertTimetable = async (cTimetable) => {
	try {
		let i = 0;
		for (const lesson of cTimetable) {
			let id = lesson.id;
			let date = lesson.date;
			let startTime = lesson.startTime;
			let endTime = lesson.endTime;
			let subject = lesson.su[0] != null ? lesson.su[0].longname : "";
			let room = lesson.ro[0] != null ? lesson.ro[0].name : "";
			let teacher = lesson.te[0] != null ? lesson.te[0].longname : "";

			let start = parse(`${date}${startTime}`, 'yyyyMMddHmm', startOfDay(new Date()));
			let end = parse(`${date}${endTime}`, 'yyyyMMddHmm', startOfDay(new Date()));

			let colorId = 2; //Green

			if (lesson.code) {
				if (lesson.code == 'cancelled') {
					colorId = 4; //Red
				}
			}

			await google.insertEvent(id, subject, room, teacher, colorId, start, end);

			i += 1;

			process.stdout.write(`Inserted ${i} events.\r`);
			logger.info(`Inserted ${subject} on ${start}`, { time: `${new Date()}` });
		}
		console.log('');
	} catch (err) {
		console.log(err);
		logger.error(err, { time: `${new Date()}` });
	}
};

module.exports.rewrite = async () => {
	await google.deleteAllEventsFromToday();

	let timetable = await this.getTimetable();
	await this.convertAndInsertTimetable(timetable);
};

module.exports.update = async (date) => {
	let events = await google.getEventsMin(date);
	let i = 0;
	for (const event of events) {
		let eventId = event.id;
		let location = event.location != null ? event.location.split('/') : ['404', 'error'];
		let oldRoom = location[0];
		let oldTeacher = location[1];
		let oldSubject = event.summary;
		let oldColorId = event.colorId;
		let start = new Date(event.start.dateTime);
		let end = new Date(event.end.dateTime);

		let lessons = await this.getTimetableFor(start);
		let lesson = lessons.find(e => e.id == eventId);

		if (lesson) {
			let newSubject = lesson.su[0] != null ? lesson.su[0].longname : "";
			let newRoom = lesson.ro[0] != null ? lesson.ro[0].name : "";
			let newTeacher = lesson.te[0] != null ? lesson.te[0].longname : "";
			let substText = lesson.substText;

			let newColorId = 2;
			if (lesson.code) {
				if (lesson.code == 'cancelled') {
					newColorId = 4;
				}
			}

			if (!(oldRoom == newRoom)) {
				console.log(`Updated Room: ${newSubject} on ${start}.`);
				logger.info(`Updated Room: ${newSubject} on ${start}.`, { time: `${new Date()}` });
			}
			if (!(oldTeacher == newTeacher)) {
				console.log(`Updated Teacher: ${newSubject} on ${start}.`);
				logger.info(`Updated Teacher: ${newSubject} on ${start}.`, { time: `${new Date()}` });
			}
			if (!(oldColorId == newColorId)) {
				if (newColorId == 4) {
					console.log(`Cancelled: ${newSubject} on ${start}.`);
					logger.info(`Cancelled: ${newSubject} on ${start}.`, { time: `${new Date()}` });
					push.sendCancellation(newSubject, start);
				}
			}
			if (!(oldSubject == newSubject)) {
				console.log(`Updated Subject: ${newSubject} on ${start}.`);
				logger.info(`Updated Subject: ${newSubject} on ${start}.`, { time: `${new Date()}` });
			}

			if (!(oldRoom == newRoom) || !(oldTeacher == newTeacher) || !(oldColorId == newColorId) || !(oldSubject == newSubject)) {
				google.update(eventId, newSubject, newRoom, newTeacher, newColorId, start, end);
			}

			i++;
			process.stdout.write(`Checked ${i}/${events.length} events\r`);
		}
	}
	console.log('');
	logger.info('Updated all events', { time: `${new Date()}` });
	console.log('Updated all events');
};

module.exports.addNew = async (oldT, curT) => {
	if (oldT && curT) {
		let cur1 = [];
		let old1 = [];
		let newEvents = [];

		for (const event of oldT) {
			old1.push(event.id);
		}
		for (const event of curT) {
			cur1.push(event.id);
		}

		let ids = cur1.filter(x => !old1.includes(x));

		for (const id of ids) {
			let event = curT.find(x => x.id == id);
			newEvents.push(event);
		}

		await this.convertAndInsertTimetable(newEvents);
	}
	return;
};

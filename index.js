const untis = require('./untis.js');
const logger = require('./logger.js');
const google = require('./google.js');
const push = require('./pushsafer');
const { parse, startOfDay } = require('date-fns');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const run = async () => {
	console.log('Started untis-google.');

	// Arguments
	let args = process.argv.slice(2);
	if (args[0] == 'rewrite') await untis.rewrite();
	if (args[0] == 'update') await untis.update(new Date());

	let oldT = await untis.getTimetable();

	let running = false;
	intervalID = setInterval(async () => {
		if (running) return;
		if (untis == null) return;
		running = true;

		let success = false;
		let retry = 0;
		while (!success) {
			try {
				var curT = await untis.getTimetable();

				// Check if update occured
				if (JSON.stringify(oldT) !== JSON.stringify(curT)) {
					logger.info('Update received', { time: `${new Date()}` });
					console.log('Update received');
					// Add new events
					await untis.addNew(oldT, curT);
					// Update events
					await untis.update(new Date());
					// Update oldT to curT  
					oldT = curT;
				}

				success = true;
				running = false;
			} catch (err) {
				if (retry > 10) {
					console.log(err);
					logger.error(err, { time: `${new Date()}` });
					running = false;
					clearInterval(intervalID);
					logger.info(`Stopped after ${retry} tries.`, { time: `${new Date()}` });
					console.log(`Stopped after ${retry} tries.`);
					push.sendCrash();
					break;
				}
				await delay(3000);
				retry++;
			}
		}
	}, process.env.INTERVAL_MINUTES * 60 * 1000);
}

(async () => {
	run();
})();
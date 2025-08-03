let client;
app.initialized().then(
	function (client) {
		//If successful, register the app activated and deactivated method callback.
		client.events.on("app.activated", onAppActivated(client));
		//client.events.on("app.deactivated", onAppDeactivated);
	},
	function (error) {
		//If unsuccessful
		handleErr(error);
	}
);

function onAppActivated(_client) {
	client = _client;
	client.events.on('app.activated', function log() {
		//return console.log(`full page location:  app is activated 🥁`);
	});
	//Prepare coming Monday as a start
	const fromDate = new Date();
	fromDate.setDate(fromDate.getDate() + (((1 + 7 - fromDate.getDay()) % 7) || 7));
	const fromDateString = fromDate.toISOString().slice(0, 10);

	//Prepare coming Sunday as end
	const toDate = new Date();
	toDate.setDate(fromDate.getDate() + 6);
	const toDateString = toDate.toISOString().slice(0, 10);

	//Set date for start
	const startDate = document.querySelector('input[id="start"]');
	startDate.value = fromDateString;

	//Set date for end
	const endDate = document.querySelector('input[id="end"]');
	endDate.value = toDateString;

	//getEmployeeList(client);
}

function sortByDate(a, b) {
	if (a.due_by > b.due_by) return 1;
	else if (b.due_by > a.due_by) return -1;
	else return 0;
}

async function getEmployeeList() {
	try {
		//Create table holder
		document.getElementById('employeeTable').innerHTML = `
		<div id="tableHeader" class="row">
			<div class="cell">
				Ärendenummer
			</div>
			<div class="cell">
				Bolag
			</div>
			<div class="cell">
				Upphämtningsställe
			</div>
			<div class="cell">
				Datum
			</div>
			<div class="cell">
				Anställningstyp & Namn
			</div>
			<div class="cell">
				Status
			</div>
		</div>`;

		//Read group memberships from logged in user
		const userGroups = (await client.data.get("loggedInUser")).loggedInUser.group_ids;
		console.log((await client.data.get("loggedInUser")).loggedInUser);
		//Format for search query
		const groupsString = "group_id:" + userGroups.join(" OR group_id:");


		const tickets = new Tickets();
		await tickets.getTickets(groupsString);
		tickets.viewTickets();

		//Get list of upcoming tickets that are to be sent
	} catch (error) {
		console.log(error);
	}
}

function handleErr(err = 'None') {
	console.error(`Error occured. Details:`, err);
}

class Agent {
	constructor(parameters) {
		
	}
}

class Ticket {
	constructor(ticket) {
		const words = ticket.subject.split('|');
		const title = words[1].split(' - ');
		this.ticketId = ticket.id;
		this.company = words[0];
		this.pickupLocation = title[0];
		this.date = title[1];
		this.typeAndName = words[2];
		this.statusText = statusList[ticket.status].text;
		this.statusColour = statusList[ticket.status].colour;
	}
	setRow() {
		document.getElementById('employeeTable').innerHTML += `
		<a class="row linkRow" target="_blank" href="https://bonniernews.freshservice.com/a/tickets/${this.ticketId}">
			<div class="cell isFirstColumn">
				#SR-${this.ticketId}
			</div>
			<div class="cell">
				${this.company}
			</div>
			<div class="cell">
				${this.pickupLocation}
			</div>
			<div class="cell">
				${this.date}
			</div>
			<div class="cell">
				${this.typeAndName}
			</div>
			<div id="statusCell" class="cell" style="background-color:${this.statusColour}">
				${this.statusText}
			</div>
		</a>`;
	}
}

class Tickets {
	constructor() {
		this.tickets = [];
		this.totalTickets = 0;
	}
	async getTickets(groups, page = 1) {
		const data = await client.request.invokeTemplate('requestNewEmployeeList', {
			context: {
				toDate: document.getElementById("end").value,
				fromDate: document.getElementById("start").value,
				groups: groups,
				page: page
			}
		});
		const parsedResponse = JSON.parse(data.response);

		const tickets = parsedResponse.tickets;
		this.totalTickets = parsedResponse.total;

		tickets.forEach(ticket => {
			this.tickets.push(new Ticket(ticket));
		});

		this.tickets.sort(sortByDate)
	}
	viewTickets() {
		//Handle pagination
		if (this.totalTickets > this.tickets.length) {
			document.getElementById('employeeTable').innerHTML = '<h3>Too many tickets in timespan, please narrow down your search.</h3>';
			//get next page either by making a next page button or getting everything (bad idea)
		}
		//Handle empty response
		else if (this.tickets.length === 0) {
			document.getElementById('employeeTable').innerHTML = '<h3>No tickets found in selected timerange! 🎉</h3>';
		}
		else this.tickets.forEach(ticket => {
			ticket.setRow();
		});
	}
}

const statusList = [
	{},
	{},
	{ text: 'Open', 	colour: '#8be9fd55' },
	{ text: 'Pending', 	colour: '#f1fa8c55' },
	{ text: 'Resolved', colour: '#50fa7b55' },
	{ text: 'Resolved', colour: '#50fa7b55' },
	{ text: 'Hold', 	colour: '#f1fa8c55' }
];

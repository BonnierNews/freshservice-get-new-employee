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

	const fromDate = new CustomDate();
	fromDate.setComing(Week.Monday);

	const toDate = new CustomDate(fromDate.date);
	toDate.addDays(6);

	fromDate.updateSelector("start");
	toDate.updateSelector("end");

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

		const agent = new Agent();
		await agent.getAgent();

		const tickets = new Tickets();
		await tickets.getTickets(agent);
		await tickets.getTickets(agent, true)
		tickets.viewTickets();

	} catch (error) {
		console.log(error);
	}
}

class CustomDate {
	constructor(date = new Date()) {
		this.date = structuredClone(date);
	}
	setComing(weekday) {
		this.date.setDate(this.date.getDate() + (((weekday + 7 - this.date.getDay()) % 7 || 7)));
	}
	addDays(days) {
		this.date.setDate(this.date.getDate() + days);
	}
	getFormatedDate() {
		return this.date.toISOString().slice(0, 10);
	}
	updateSelector(selector){
		document.querySelector(`input[id="${selector}"]`).value = this.getFormatedDate();
	}
	fetchSelector(selector){
		this.date = new Date(document.getElementById(selector).value);
	}
}

const Week = {
	Monday: 1,
	Tuesday: 2,
	Wednesday: 3,
	Thursday: 4,
	Friday: 5,
	Saturday: 6,
	Sunday: 0
};

function sortByDate(a, b) {
	if (a.due_by > b.due_by) return 1;
	else if (b.due_by > a.due_by) return -1;
	else return 0;
}

function handleErr(err = 'None') {
	console.error(`Error occured. Details:`, err);
}

class Agent {
	constructor() {
		this.name = "";
		this.address = "";
		this.shortAddress = "";
		this.groups = [];
	}
	async getAgent() {
		const data = (await client.data.get("loggedInUser")).loggedInUser;
		this.name = data.user.name;
		this.address = data.user.location_name;
		this.groups = data.group_ids;
		this.shortAddress = this.address.split(',')[1];
	}
	getGroups() {
		return "group_id:" + this.groups.join(" OR group_id:");
	}
}

class Ticket {
	constructor(ticket) {
		//Update split logic
		const words = ticket.subject.split('|');
		this.company = words[0]
		if (words.length === 4) { //The new format
			this.pickupLocation = words[1];
			this.date = words[2];
			this.typeAndName = words[3];
			this.company = this.company.replace("Onboarding: ","");
		} else { //Old format
			this.company = this.company.replace("Employee Management ","");
			this.company = this.company.replace(" - Onboarding","");
			this.company = this.company.replace(" Onboarding","");
			
		const title = words[1].split(' - ');
			if (title.length == 1) {
				this.date = title[0];
				this.pickupLocation = "okänt";
			}
			else {
				this.pickupLocation = title[0];
				this.date = title[1];
			}
			this.typeAndName = words[2]; 
		}

		
		this.ticketId = ticket.id;
		
		this.statusText = statusList[ticket.status].text;
		this.statusColour = statusList[ticket.status].colour;
		this.due_by = ticket.due_by;
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
	async getTickets(agent, future = false, page = 1) {
		const toDate = new CustomDate();
		toDate.fetchSelector("end");
		toDate.addDays(future ? 7 : 0);
		const fromDate = new CustomDate();
		fromDate.fetchSelector("start");
		fromDate.addDays(future ? 7 : 0);

		const data = await client.request.invokeTemplate('requestNewEmployeeList', {
			context: {
				toDate: toDate.getFormatedDate(),
				fromDate: fromDate.getFormatedDate(),
				groups: agent.getGroups(),
				page: page
			}
		});
		const parsedResponse = JSON.parse(data.response);

		const tickets = parsedResponse.tickets;
		this.totalTickets += parsedResponse.total;

		tickets.forEach(ticket => {
			const tempTicket = new Ticket(ticket);
			if (!future) {
				this.tickets.push(tempTicket);
			}
			else if (future && !tempTicket.pickupLocation.includes(agent.shortAddress) && !this.tickets.find((ticket) => ticket.ticketId === tempTicket.ticketId)) {
				this.tickets.push(tempTicket);
			}
			else this.totalTickets--;
		});
		this.tickets.sort(sortByDate);
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
	{ text: 'On Hold', 	colour: '#f1fa8c55' }
];

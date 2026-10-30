import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const indexHtml = readFileSync(resolve(__dirname, '../app/index.html'), 'utf8');
const body = indexHtml.match(/<body>([\s\S]*)<\/body>/)[1];

const loggedInUser = {
  loggedInUser: {
    user: { name: 'Test Agent', location_name: 'Bonnier News, Stockholm' },
    group_ids: [11, 22]
  }
};

function ticket(id, subject, dueBy, status = 2) {
  return { id, subject, due_by: dueBy, status };
}

function response(tickets, total = tickets.length) {
  return { response: JSON.stringify({ tickets, total }) };
}

let client;
let onActivated;

async function loadApp(initialized = () => Promise.resolve(client)) {
  vi.resetModules();
  global.app = { initialized: vi.fn(initialized) };
  await import('../app/scripts/app.js');
  await new Promise(resolve => setTimeout(resolve));
}

function setRange(start, end) {
  document.getElementById('start').value = start;
  document.getElementById('end').value = end;
}

function rows(tableId) {
  return [...document.querySelectorAll(`#${tableId} .linkRow`)].map(row =>
    [...row.querySelectorAll('.cell')].map(cell => cell.textContent.trim())
  );
}

beforeEach(async () => {
  document.body.innerHTML = body;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  client = {
    events: { on: vi.fn((event, handler) => { onActivated = handler; }) },
    data: { get: vi.fn(() => Promise.resolve(loggedInUser)) },
    request: { invokeTemplate: vi.fn() }
  };
  await loadApp();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('app activation', () => {
  test('registers for app.activated', () => {
    expect(global.app.initialized).toHaveBeenCalled();
    expect(client.events.on).toHaveBeenCalledWith('app.activated', expect.any(Function));
  });

  test('preselects next Monday to Sunday', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-28T12:00:00')); // Wednesday
    onActivated();

    expect(document.getElementById('start').value).toBe('2026-11-02');
    expect(document.getElementById('end').value).toBe('2026-11-08');
  });

  test('on a Monday, preselects the following week', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-02T12:00:00')); // Monday
    onActivated();

    expect(document.getElementById('start').value).toBe('2026-11-09');
    expect(document.getElementById('end').value).toBe('2026-11-15');
  });

  test('logs an error when the app fails to initialize', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('init failed');
    await loadApp(() => Promise.reject(failure));

    expect(consoleError).toHaveBeenCalledWith('Error occured. Details:', failure);
  });
});

describe('getEmployeeList', () => {
  beforeEach(() => setRange('2026-11-02', '2026-11-08'));

  test('requests this week and next week for the agent groups', async () => {
    client.request.invokeTemplate.mockResolvedValue(response([]));
    await window.getEmployeeList();

    expect(client.data.get).toHaveBeenCalledWith('loggedInUser');
    expect(client.request.invokeTemplate).toHaveBeenNthCalledWith(1, 'requestNewEmployeeList', {
      context: {
        fromDate: '2026-11-02',
        toDate: '2026-11-08',
        groups: 'group_id:11 OR group_id:22',
        page: 1
      }
    });
    expect(client.request.invokeTemplate).toHaveBeenNthCalledWith(2, 'requestNewEmployeeList', {
      context: {
        fromDate: '2026-11-09',
        toDate: '2026-11-15',
        groups: 'group_id:11 OR group_id:22',
        page: 1
      }
    });
  });

  test('renders tickets sorted by due date', async () => {
    client.request.invokeTemplate
      .mockResolvedValueOnce(response([
        ticket(102, 'Onboarding: DN | Stockholm | 2026-11-04 | Anställd: Bertil', '2026-11-04T08:00:00Z', 3),
        ticket(101, 'Onboarding: Expressen | Göteborg | 2026-11-03 | Konsult: Anna', '2026-11-03T08:00:00Z', 2)
      ]))
      .mockResolvedValueOnce(response([]));
    await window.getEmployeeList();

    expect(rows('employeeTable')).toEqual([
      ['#SR-101', 'Expressen', 'Göteborg', '2026-11-03', 'Konsult: Anna', 'Open'],
      ['#SR-102', 'DN', 'Stockholm', '2026-11-04', 'Anställd: Bertil', 'Pending']
    ]);
    const link = document.querySelector('#employeeTable .linkRow');
    expect(link.getAttribute('href')).toBe('https://bonniernews.freshservice.com/a/tickets/101');
  });

  test('parses the old subject formats', async () => {
    client.request.invokeTemplate
      .mockResolvedValueOnce(response([
        ticket(201, 'Employee Management DN - Onboarding|Stockholm - 2026-11-03|Anställd: Cecilia', '2026-11-03T08:00:00Z', 4),
        ticket(202, 'Employee Management Expressen Onboarding|2026-11-03|Konsult: David', '2026-11-03T08:00:00Z', 6)
      ]))
      .mockResolvedValueOnce(response([]));
    await window.getEmployeeList();

    expect(rows('employeeTable')).toEqual([
      ['#SR-201', 'DN', 'Stockholm', '2026-11-03', 'Anställd: Cecilia', 'Resolved'],
      ['#SR-202', 'Expressen', 'okänt', '2026-11-03', 'Konsult: David', 'On Hold']
    ]);
  });

  test('shows only other locations for next week', async () => {
    client.request.invokeTemplate
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([
        ticket(301, 'Onboarding: DN | Stockholm | 2026-11-10 | Anställd: Erik', '2026-11-10T08:00:00Z'),
        ticket(302, 'Onboarding: GP | Göteborg | 2026-11-11 | Anställd: Fia', '2026-11-11T08:00:00Z')
      ]));
    await window.getEmployeeList();

    expect(rows('employeeTableFuture').map(row => row[0])).toEqual(['#SR-302']);
  });

  test('shows a message when no tickets are found', async () => {
    client.request.invokeTemplate.mockResolvedValue(response([]));
    await window.getEmployeeList();

    expect(document.getElementById('employeeTable').textContent).toContain('No tickets found in selected timerange!');
    expect(document.getElementById('employeeTableFuture').textContent).toContain('No tickets found in selected timerange!');
  });

  test('renders pagination when there are more tickets than returned', async () => {
    client.request.invokeTemplate
      .mockResolvedValueOnce(response([
        ticket(401, 'Onboarding: DN | Stockholm | 2026-11-03 | Anställd: Gustav', '2026-11-03T08:00:00Z')
      ], 61))
      .mockResolvedValueOnce(response([]));
    await window.getEmployeeList();

    const buttons = [...document.querySelectorAll('.pagination button')];
    expect(buttons.map(button => button.textContent.trim())).toEqual(['1', '2', '3']);
    expect(buttons[0].classList.contains('active')).toBe(true);
  });

  test('logs and swallows request errors', async () => {
    const failure = new Error('403 access_denied');
    client.request.invokeTemplate.mockRejectedValue(failure);

    await expect(window.getEmployeeList()).resolves.toBeUndefined();
    expect(console.log).toHaveBeenCalledWith(failure);
  });
});

describe('updateList', () => {
  beforeEach(() => setRange('2026-11-02', '2026-11-08'));

  test('loads the selected page and marks it active', async () => {
    client.request.invokeTemplate.mockResolvedValue(response([
      ticket(501, 'Onboarding: DN | Stockholm | 2026-11-03 | Anställd: Hanna', '2026-11-03T08:00:00Z')
    ], 45));
    await window.updateList(2);

    expect(client.request.invokeTemplate).toHaveBeenCalledTimes(1);
    expect(client.request.invokeTemplate.mock.calls[0][1].context.page).toBe(2);
    expect(rows('employeeTable').map(row => row[0])).toEqual(['#SR-501']);
    const active = [...document.querySelectorAll('.pagination button.active')];
    expect(active.map(button => button.textContent.trim())).toEqual(['2']);
  });

  test('logs and swallows request errors', async () => {
    const failure = new Error('network');
    client.request.invokeTemplate.mockRejectedValue(failure);

    await expect(window.updateList(2)).resolves.toBeUndefined();
    expect(console.log).toHaveBeenCalledWith(failure);
  });
});

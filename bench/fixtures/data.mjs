// Deterministic data + expected answers for the benchmark fixtures.
// Seeded PRNG only (no Math.random) so every process / every run sees the same data.

export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function emptyState() {
  return {
    stayDetails: [], // {room,name,email,phone,arrival,requests,bookingId}
    stayPayments: [], // {bookingId,paid:true}
    cart: [], // {productId}
    settings: [], // {notificationEmail,weeklySummary,productNews,profileName}
    tickets: [], // {topic,order,message,ticketId}
    applications: [], // all form values
    gates: [], // {action, fields}: anything that got past alter's gates (spike E4)
  };
}

// ---------------------------------------------------------------- stay
export const STAY = {
  name: 'Palm House',
  checkIn: '2026-11-12',
  checkOut: '2026-11-14',
  nights: 2,
  rooms: [
    {
      id: 'garden',
      name: 'Garden double',
      total: 4200,
      desc: 'Ground-floor double room opening onto the tropical garden, with a king bed and an outdoor rain shower.',
      features: ['King bed', '28 m2', 'Garden terrace'],
    },
    {
      id: 'pool',
      name: 'Pool suite',
      total: 7800,
      desc: 'Corner suite with a private plunge pool, a separate lounge area and a pillow menu.',
      features: ['King bed', '54 m2', 'Private plunge pool'],
    },
    {
      id: 'street',
      name: 'Street single',
      total: 2600,
      desc: 'Compact single room overlooking the old town street. Double-glazed and quiet at night.',
      features: ['Single bed', '16 m2', 'Street view'],
    },
  ],
};
export const ARRIVAL_TIMES = ['12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];
export const fmtBaht = (n) => '฿' + n.toLocaleString('en-US');

// ---------------------------------------------------------------- shop
export const BRANDS = ['Aster', 'Borealis', 'Corvid', 'Dynamo', 'Ember', 'Fjord'];
const LINES = ['Air', 'Pro', 'Studio', 'Edge', 'Flex', 'Core', 'Nova', 'Prime', 'Lite', 'Zen'];
const SIZES = [13, 14, 15, 16, 17];
const CPUS = ['Ryzen 5', 'Ryzen 7', 'Core i5', 'Core i7', 'Core Ultra 7', 'M-series 8-core'];
const STORAGE = [256, 512, 1024, 2048];
const STORAGE_BONUS = { 256: 0, 512: 100, 1024: 250, 2048: 500 };
const BASE_PRICE = { 8: 449, 16: 749, 32: 1199 };

// The one product that must be the cheapest 32 GB laptop. Position 58 of 72 = third page.
const CHEAPEST32_INDEX = 57; // 0-based
const CHEAPEST32_PRICE = 1149;

function buildProducts() {
  const r = prng(7331);
  const out = [];
  const names = new Set();
  for (let i = 0; i < 72; i++) {
    const brand = BRANDS[Math.floor(r() * 6)];
    const memory = [8, 16, 32][Math.floor(r() * 3)];
    const storage = STORAGE[Math.floor(r() * 4)];
    const line = LINES[Math.floor(r() * LINES.length)];
    const size = SIZES[Math.floor(r() * SIZES.length)];
    let name = `${brand} ${line} ${size}`;
    let n = 1;
    while (names.has(name)) name = `${brand} ${line} ${size} Mk${++n}`;
    names.add(name);
    const cpu = CPUS[Math.floor(r() * CPUS.length)];
    const price = BASE_PRICE[memory] + STORAGE_BONUS[storage] + Math.round(r() * 40) * 10;
    out.push({ id: 'lp-' + String(i + 1).padStart(3, '0'), name, brand, memory, storage, cpu, price });
  }
  const t = out[CHEAPEST32_INDEX];
  t.memory = 32;
  t.storage = 512;
  t.price = CHEAPEST32_PRICE;
  return out;
}
export const PRODUCTS = buildProducts();
export const PAGE_SIZE = 24;
export const fmtUsd0 = (n) => '$' + n.toLocaleString('en-US');

export function queryProducts({ brand, memory, sort } = {}) {
  let list = PRODUCTS.slice();
  const brands = brand ? String(brand).split(',').filter(Boolean) : [];
  if (brands.length) list = list.filter((p) => brands.includes(p.brand));
  if (memory) list = list.filter((p) => String(p.memory) === String(memory));
  if (sort === 'price_asc') list.sort((a, b) => a.price - b.price || a.id.localeCompare(b.id));
  else if (sort === 'price_desc') list.sort((a, b) => b.price - a.price || a.id.localeCompare(b.id));
  return list;
}

// ---------------------------------------------------------------- table
export const CUSTOMERS = [
  'Northwind', 'Contoso', 'Fabrikam', 'Globex', 'Initech', 'Umbrella Corp',
  'Hooli', 'Stark Industries', 'Wayne Enterprises', 'Wonka Industries', 'Soylent', 'Northwood Labs',
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function addDays(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export const fmtDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
export const fmtUsd = (cents) => {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toLocaleString('en-US');
  return `${sign}$${whole}.${String(abs % 100).padStart(2, '0')}`;
};
const NW_OVERDUE_IDX = [6, 44, 82, 120, 158, 196]; // pages 1,3,5,7,8,10 (20 per page)
const NW_OPEN_IDX = [175, 185];
const NW_PAID_IDX = [20, 60, 100];

function buildInvoices() {
  const r = prng(4242);
  const out = [];
  for (let i = 0; i < 200; i++) {
    const customer = CUSTOMERS[Math.floor(r() * CUSTOMERS.length)];
    const issued = addDays('2026-01-02', Math.floor(i * 1.35));
    const terms = [14, 30, 30, 45][Math.floor(r() * 4)];
    const due = addDays(issued, terms);
    const amountCents = Math.round((120 + r() * 4880) * 100);
    const roll = r();
    let status;
    if (i >= 160) status = roll < 0.45 ? 'Open' : roll < 0.8 ? 'Paid' : 'Overdue';
    else status = roll < 0.7 ? 'Paid' : 'Overdue';
    out.push({ number: 'INV-' + (1001 + i), customer, issued, due, amountCents, status });
  }
  NW_OVERDUE_IDX.forEach((i) => { out[i].customer = 'Northwind'; out[i].status = 'Overdue'; });
  NW_OPEN_IDX.forEach((i) => { out[i].customer = 'Northwind'; out[i].status = 'Open'; });
  NW_PAID_IDX.forEach((i) => { out[i].customer = 'Northwind'; out[i].status = 'Paid'; });
  out.forEach((row, i) => {
    if (row.customer === 'Northwind' && row.status === 'Overdue' && !NW_OVERDUE_IDX.includes(i)) row.status = 'Paid';
  });
  return out;
}
export const INVOICES = buildInvoices();

// ---------------------------------------------------------------- form
export const COUNTRIES = [
  ['AU', 'Australia'], ['CA', 'Canada'], ['FR', 'France'], ['DE', 'Germany'], ['IN', 'India'],
  ['JP', 'Japan'], ['NL', 'Netherlands'], ['SG', 'Singapore'], ['ES', 'Spain'], ['TH', 'Thailand'],
  ['GB', 'United Kingdom'], ['US', 'United States'],
];
export const INTERESTS = [
  ['cycling', 'Cycling'], ['photography', 'Photography'], ['cooking', 'Cooking'],
  ['chess', 'Chess'], ['hiking', 'Hiking'],
];
export const PROFILE = {
  firstName: 'Elena',
  lastName: 'Voss',
  dob: '1991-04-17',
  email: 'elena.voss@example.com',
  phone: '+49 30 5550 1234',
  street: 'Kastanienallee 41',
  city: 'Berlin',
  postcode: '10435',
  country: 'DE',
  company: 'Brightloop GmbH',
  role: 'Product Designer',
  years: 7,
  employmentType: 'full-time',
  startDate: '2026-12-01',
  newsletter: true,
  contactMethod: 'email',
  interests: ['photography', 'hiking'],
  notes: 'Prefer remote-first teams; available for interviews after 4 pm CET.',
  consent: true,
};

// ---------------------------------------------------------------- expected answers
const cheapest32 = PRODUCTS.filter((p) => p.memory === 32).sort((a, b) => a.price - b.price);
if (cheapest32[0].price === cheapest32[1].price) throw new Error('fixture invariant: cheapest 32 GB must be unique');
const cheapestIdx = PRODUCTS.findIndex((p) => p.id === cheapest32[0].id);
if (cheapestIdx < 48) throw new Error('fixture invariant: cheapest 32 GB must be among products 49-72');

const nwOverdue = INVOICES.filter((r) => r.customer === 'Northwind' && r.status === 'Overdue');
if (nwOverdue.length < 5) throw new Error('fixture invariant: need >= 5 Northwind overdue rows');
const nwCents = nwOverdue.reduce((s, r) => s + r.amountCents, 0);

export const expected = {
  stay: {
    room: 'garden',
    name: 'Maya Chen',
    email: 'maya@example.com',
    phone: '+66 80 000 0000',
    arrival: '15:00',
    requestsPattern: 'quiet',
    total: 4200,
  },
  shop: {
    productId: cheapest32[0].id,
    name: cheapest32[0].name,
    price: cheapest32[0].price,
    priceText: fmtUsd0(cheapest32[0].price),
    position: cheapestIdx + 1,
  },
  app: { notificationEmail: 'alerts@example.com', weeklySummary: true, productNews: false },
  frame: { topic: 'order-issue', order: '58213', messageIncludes: 'damaged' },
  table: {
    customer: 'Northwind',
    overdueCount: nwOverdue.length,
    overdueNumbers: nwOverdue.map((r) => r.number),
    totalCents: nwCents,
    totalFormatted: fmtUsd(nwCents),
    totalDigits: fmtUsd(nwCents).replace(/\D/g, ''), // digits of the formatted total incl. cents
  },
  form: PROFILE,
};

'use strict';
// Loads data/hospitals.json and tolerates different column names, so your
// 5,000+ entry Telangana dataset can be dropped in without editing code.
// Accepted shapes: [ {...}, {...} ]  or  { "hospitals": [ ... ] }
const fs = require('fs');
const path = require('path');

const FILE = process.env.HOSPITALS_FILE || path.join(__dirname, '..', 'data', 'hospitals.json');

const KEYS = {
  name: ['name', 'hospitalname', 'hospital', 'facilityname', 'title'],
  lat: ['lat', 'latitude', 'y'],
  lng: ['lng', 'lon', 'long', 'longitude', 'x'],
  district: ['district', 'districtname'],
  address: ['address', 'location', 'addr', 'fulladdress'],
  phone: ['phone', 'phoneno', 'phonenumber', 'contact', 'contactnumber', 'mobile', 'telephone'],
  type: ['type', 'category', 'hospitaltype', 'facilitytype', 'ownership'],
};

const squash = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');

function pick(map, names) {
  for (const n of names) {
    const v = map[n];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return undefined;
}

function normalise(raw, i) {
  const map = {};
  for (const k of Object.keys(raw)) map[squash(k)] = raw[k];
  const name = pick(map, KEYS.name);
  if (!name) return null;
  const lat = parseFloat(pick(map, KEYS.lat));
  const lng = parseFloat(pick(map, KEYS.lng));
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const h = {
    id: i,
    name: String(name).trim(),
    district: String(pick(map, KEYS.district) || '').trim(),
    address: String(pick(map, KEYS.address) || '').trim(),
    phone: String(pick(map, KEYS.phone) || '').trim(),
    type: String(pick(map, KEYS.type) || '').trim(),
    lat: hasCoords ? lat : null,
    lng: hasCoords ? lng : null,
  };
  h._search = [h.name, h.district, h.address, h.type].join(' ').toLowerCase();
  return h;
}

let list = [];
let districts = [];

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed.hospitals) ? parsed.hospitals : [];
    list = rows.map(normalise).filter(Boolean);
  } catch (err) {
    console.error(`Could not read hospitals file (${FILE}):`, err.message);
    list = [];
  }
  districts = [...new Set(list.map((h) => h.district).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  console.log(`Loaded ${list.length} hospitals across ${districts.length} districts`);
}
load();

// Haversine distance in kilometres.
function km(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function search({ q, district, lat, lng, limit = 12, offset = 0 }) {
  const needle = String(q || '').trim().toLowerCase();
  const dist = String(district || '').trim().toLowerCase();
  const here = Number.isFinite(lat) && Number.isFinite(lng);

  let rows = list.filter((h) => (!needle || h._search.includes(needle)) && (!dist || h.district.toLowerCase() === dist));

  let out = rows.map((h) => ({
    id: h.id,
    name: h.name,
    district: h.district,
    address: h.address,
    phone: h.phone,
    type: h.type,
    lat: h.lat,
    lng: h.lng,
    distanceKm: here && h.lat !== null ? Math.round(km(lat, lng, h.lat, h.lng) * 10) / 10 : null,
  }));

  if (here) {
    out.sort((a, b) => {
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;
      return a.distanceKm - b.distanceKm;
    });
  } else {
    out.sort((a, b) => a.name.localeCompare(b.name));
  }

  return { total: out.length, items: out.slice(offset, offset + limit) };
}

module.exports = {
  search,
  stats: () => ({ hospitals: list.length, districts }),
};

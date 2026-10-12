'use strict';
// Single source of truth for prices. The browser only ever sends a product id;
// the amount charged is always taken from here, so prices can't be tampered with.

const NETWORKS = {
  mtn:     { name: 'MTN',        list: [["1GB",6],["2GB",12],["3GB",17],["4GB",23],["5GB",27],["6GB",34],["7GB",38],["8GB",42],["10GB",50],["15GB",70],["20GB",92],["30GB",135],["50GB",215],["100GB",430]] },
  telecel: { name: 'Telecel',    list: [["5GB",24],["10GB",45],["15GB",62],["20GB",85],["25GB",105],["30GB",120],["40GB",160],["50GB",200]] },
  tigo:    { name: 'AirtelTigo', list: [["1GB",5],["2GB",10],["3GB",15],["5GB",24],["10GB",46],["15GB",60],["20GB",86],["30GB",125],["50GB",220],["100GB",420]] }
};

const products = {};
const bundles = {};

for (const [key, net] of Object.entries(NETWORKS)) {
  bundles[key] = [];
  for (const [gb, price] of net.list) {
    const id = `${key}-${gb.toLowerCase()}`;
    products[id] = { id, type: 'data', service: `${net.name} Data`, desc: gb, price };
    bundles[key].push(id);
  }
}

const extras = [
  { id: 'univ-form',      type: 'extra',  service: 'University Form',  desc: 'University Admission Form',        price: 230 },
  { id: 'result-checker', type: 'extra',  service: 'Result Checker',   desc: 'WASSCE/BECE Result Checker',       price: 30 },
  { id: 'voice-bundle',   type: 'extra',  service: 'Voice Bundle',     desc: 'Alpha Voice Bundle Registration',  price: 15 },
  { id: 'ishare-reg',     type: 'ishare', service: 'AirtelTigo iShare Registration', desc: 'iShare registration', price: 15 }
];
for (const p of extras) products[p.id] = p;

const getProduct = id => (typeof id === 'string' && Object.prototype.hasOwnProperty.call(products, id)) ? products[id] : null;

module.exports = { products, bundles, getProduct };

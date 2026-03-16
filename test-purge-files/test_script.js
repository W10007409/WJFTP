// JS Purge Test - import/require references

import config from './config.js';
import utils from '/JS/utils.js';
import { helper } from '../lib/helper.js';

const data = require('./data.json');
const api = require('/JS/api_client.js');

// Dynamic imports
async function loadModule() {
  const mod = await import('./modules/player.js');
  const lib = await import('/JS/lib/analytics.js');
  return { mod, lib };
}

// CDN URLs in string literals (NOT parsed by current regex, just for reference)
const CDN_BASE = 'https://cache.wjthinkbig.com';
const IMAGE_URL = `${CDN_BASE}/RESOURCES/IMAGES/logo.png`;

console.log('Test script loaded');

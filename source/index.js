/**
 * Fuente AnimeAV1 v1.0.0
 * getStreams(tmdbId, type, season, episode)
 * extract(url) — resuelve embeds Voe / MP4Upload a HLS/MP4
 *
 * Preferencia: Voe (H.264 720p HLS, compatible TV) → MP4Upload (AV1 1080p)
 */

var BASE = 'https://animeav1.com';
var UA =
  'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function headers(extra) {
  var h = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9',
    Referer: BASE + '/',
  };
  if (extra) {
    Object.keys(extra).forEach(function (k) {
      h[k] = extra[k];
    });
  }
  return h;
}

async function httpGet(url, extraHeaders) {
  try {
    var res = await fetch(url, {
      headers: headers(extraHeaders),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (e) {
    return null;
  }
}

async function fetchJson(url) {
  var res = await fetch(url, { headers: headers({ Accept: 'application/json' }) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return await res.json();
}

// ─── unflatten ───────────────────────────────────────────

function unflatten(flat) {
  if (!Array.isArray(flat) || flat.length === 0) return null;
  var cache = {};
  function get(i) {
    if (typeof i !== 'number' || i < 0) return undefined;
    if (cache.hasOwnProperty(i)) return cache[i];
    var v = flat[i];
    if (Array.isArray(v)) {
      if (typeof v[0] === 'string') {
        cache[i] = v[1];
        return v[1];
      }
      var out = [];
      cache[i] = out;
      for (var x = 0; x < v.length; x++) out.push(get(v[x]));
      return out;
    }
    if (v && typeof v === 'object') {
      var obj = {};
      cache[i] = obj;
      var keys = Object.keys(v);
      for (var k = 0; k < keys.length; k++) {
        obj[keys[k]] = get(v[keys[k]]);
      }
      return obj;
    }
    cache[i] = v;
    return v;
  }
  return get(0);
}

function loadPageData(body) {
  if (!body || body.type === 'redirect' || body.type === 'error') return null;
  var nodes = (body.nodes || []).filter(function (n) {
    return n && n.type === 'data' && Array.isArray(n.data);
  });
  if (!nodes.length) return null;
  return unflatten(nodes[nodes.length - 1].data);
}

async function loadData(path) {
  var url = BASE + path + '/__data.json';
  var body = await fetchJson(url);
  return loadPageData(body);
}

// ─── ID helpers ──────────────────────────────────────────

function isAnimeAv1Id(id) {
  if (!id) return false;
  var s = String(id);
  if (s.indexOf('animeav1.com') >= 0) return true;
  if (s.indexOf('animeav1:') === 0) return true;
  if (/^[a-z0-9][a-z0-9\-]*$/i.test(s) && s.indexOf('tmdb') < 0 && s.indexOf('tt') !== 0) return true;
  return false;
}

function parseRef(tmdbId, episode) {
  var raw = String(tmdbId || '').trim();
  var slug = '';
  var ep = parseInt(episode, 10) || 1;

  if (/\/media\/[^\/]+\/\d+/i.test(raw)) {
    var m = /\/media\/([^\/]+)\/(\d+)/i.exec(raw);
    if (m) {
      slug = m[1];
      ep = parseInt(m[2], 10) || 1;
    }
  } else if (raw.indexOf('animeav1:') === 0) {
    var parts = raw.split(':');
    slug = parts[1] || '';
    if (parts.length >= 3 && /^\d+$/.test(parts[2])) {
      ep = parseInt(parts[2], 10);
    }
  } else if (raw.indexOf('animeav1.com') >= 0) {
    var m2 = /\/media\/([^\/\?\#]+)/i.exec(raw) || /animeav1\.com\/([^\/\?\#]+)/i.exec(raw);
    if (m2) slug = m2[1];
  } else {
    slug = raw.replace(/\/+$/, '').split('/').pop() || raw;
  }

  if (!slug) return null;
  return { slug: slug, episode: ep };
}

// ─── Resolvers ───────────────────────────────────────────

function decodeEscapes(s) {
  return String(s)
    .replace(/\\u([0-9a-fA-F]{4})/g, function (_, h) {
      return String.fromCharCode(parseInt(h, 16));
    })
    .replace(/\\\//g, '/');
}

async function fromMp4Upload(embedUrl) {
  var html = await httpGet(embedUrl);
  if (!html) throw new Error('mp4upload empty');
  var m =
    html.match(/src\s*:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i) ||
    html.match(/["']?file["']?\s*:\s*["'](https?:\/\/[^"']+)["']/i) ||
    html.match(/<source[^>]+src\s*=\s*["'](https?:\/\/[^"']+)["']/i);
  if (!m) throw new Error('mp4upload: no video');
  return {
    url: decodeEscapes(m[1]),
    mime: 'video/mp4',
    headers: { Referer: 'https://www.mp4upload.com/', 'User-Agent': UA },
    server: 'MP4Upload',
  };
}

function voeDecode(packed) {
  var s = packed.replace(/[a-zA-Z]/g, function (c) {
    var base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
  var junks = ['@$', '^^', '~@', '%?', '*~', '!!', '#&'];
  for (var i = 0; i < junks.length; i++) {
    s = s.split(junks[i]).join('');
  }
  try {
    s = atob(s);
  } catch (e) {
    return null;
  }
  var shifted = '';
  for (var j = 0; j < s.length; j++) {
    shifted += String.fromCharCode(s.charCodeAt(j) - 3);
  }
  try {
    return JSON.parse(atob(shifted.split('').reverse().join('')));
  } catch (e2) {
    return null;
  }
}

function voeSourceFrom(html) {
  var packed = html.match(/<script type="application\/json">\s*\[\s*"([^"]+)"\s*\]\s*<\/script>/);
  if (packed) {
    var data = voeDecode(packed[1]);
    if (data && data.source) return data.source;
  }
  var hls = html.match(/["']hls["']\s*:\s*["']([^"']+)["']/);
  if (hls) {
    var v = hls[1];
    return v.indexOf('http') === 0 ? v : (function () {
      try { return atob(v); } catch (e) { return null; }
    })();
  }
  return null;
}

async function fromVoe(embedUrl) {
  var url = embedUrl;
  for (var hop = 0; hop < 3; hop++) {
    var html = await httpGet(url);
    if (!html) throw new Error('voe empty');
    var source = voeSourceFrom(html);
    if (source) {
      return {
        url: source,
        mime: 'application/vnd.apple.mpegurl',
        headers: { 'User-Agent': UA },
        server: 'Voe',
      };
    }
    var next = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
    if (!next) break;
    url = next[1];
  }
  throw new Error('voe: no source');
}

var RESOLVERS = {
  Voe: fromVoe,
  MP4Upload: fromMp4Upload,
};

// Prefer Voe for TV compatibility
var SERVER_ORDER = ['Voe', 'MP4Upload'];

function isPlayable(url) {
  if (!url) return false;
  return /\.m3u8(\?|$)/i.test(url) || /\.mp4(\?|$)/i.test(url) || /\/hls\//i.test(url);
}

// ─── extract (public) ────────────────────────────────────

async function extract(url) {
  if (!url) return null;
  var u = String(url).toLowerCase();
  try {
    if (u.indexOf('voe') >= 0 || u.indexOf('jere') >= 0) {
      return await fromVoe(url);
    }
    if (u.indexOf('mp4upload') >= 0) {
      return await fromMp4Upload(url);
    }
  } catch (e) {}
  return null;
}

// ─── getStreams ──────────────────────────────────────────

async function getStreams(tmdbId, type, season, episode) {
  if (!isAnimeAv1Id(tmdbId)) return [];

  var ref = parseRef(tmdbId, episode);
  if (!ref || !ref.slug) return [];

  var data;
  try {
    data = await loadData('/media/' + ref.slug + '/' + ref.episode);
  } catch (e) {
    return [];
  }
  if (!data) return [];

  var embeds = data.embeds || {};
  // Prefer DUB then SUB (latino first)
  var langs = ['DUB', 'SUB'];
  var streams = [];
  var failures = [];

  for (var li = 0; li < langs.length; li++) {
    var lang = langs[li];
    var list = (embeds[lang] || []).filter(function (e) {
      return e && e.url && RESOLVERS[e.server];
    });
    list.sort(function (a, b) {
      return SERVER_ORDER.indexOf(a.server) - SERVER_ORDER.indexOf(b.server);
    });

    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      try {
        var resolved = await RESOLVERS[e.server](e.url);
        if (!resolved || !resolved.url || !isPlayable(resolved.url)) continue;

        var isHls = /\.m3u8/i.test(resolved.url) || (resolved.mime || '').indexOf('mpegurl') >= 0;
        streams.push({
          url: resolved.url,
          title: (resolved.server || e.server) + ' · ' + lang,
          quality: resolved.server === 'MP4Upload' ? '1080p' : '720p',
          provider: 'AnimeAV1',
          name: (resolved.server || e.server) + ' · ' + lang,
          language: lang === 'DUB' ? 'es-LA' : 'es',
          headers: resolved.headers || { 'User-Agent': UA },
          isHls: isHls,
        });
      } catch (err) {
        failures.push(lang + '/' + e.server + ': ' + (err && err.message));
      }
    }
  }

  return streams;
}

module.exports = {
  getStreams: getStreams,
  extract: extract,
};

/**
 * Addon catálogo AnimeAV1 v1.0.0
 * Datos vía SvelteKit __data.json (misma fuente que el plugin Kino).
 * IDs: animeav1:{slug}
 * extra.tmdbId = URL completa del anime (para que solo la fuente AnimeAV1 resuelva)
 */

var BASE = 'https://animeav1.com';
var CDN = 'https://cdn.animeav1.com';
var UA =
  'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ─── HTTP ────────────────────────────────────────────────

function headers(extra) {
  var h = {
    'User-Agent': UA,
    Accept: 'application/json, text/html, */*',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    Referer: BASE + '/',
  };
  if (extra) {
    Object.keys(extra).forEach(function (k) {
      h[k] = extra[k];
    });
  }
  return h;
}

async function fetchJson(url) {
  var res = await fetch(url, { headers: headers({ Accept: 'application/json' }) });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' → ' + url);
  return await res.json();
}

// ─── SvelteKit unflatten (devalue) ───────────────────────

function unflatten(flat) {
  if (!Array.isArray(flat) || flat.length === 0) return null;
  var cache = {};
  function get(i) {
    if (typeof i !== 'number' || i < 0) return undefined;
    if (cache.hasOwnProperty(i)) return cache[i];
    var v = flat[i];
    if (Array.isArray(v)) {
      if (typeof v[0] === 'string') {
        // tagged: ["Date", "..."] etc → take value
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

// ─── UTILS ───────────────────────────────────────────────

function clean(text) {
  if (!text) return '';
  return String(text).replace(/\s+/g, ' ').trim();
}

function isMovie(media) {
  if (!media) return false;
  var c = media.category || {};
  var name = String(c.name || c.slug || '').toLowerCase();
  return name.indexOf('pelicul') >= 0 || name === 'movie' || name === 'film';
}

function absCover(id) {
  if (!id) return null;
  return CDN + '/covers/' + id + '.jpg';
}

function absBackdrop(id) {
  if (!id) return null;
  return CDN + '/backdrops/' + id + '.jpg';
}

function makeItem(media) {
  if (!media || !media.slug || !media.title) return null;
  var id = String(media.id || '');
  var movie = isMovie(media);
  var type = movie ? 'movie' : 'series';
  var slug = String(media.slug);
  var poster = absCover(id);
  var title = clean(media.title);
  var overview = clean(media.synopsis || '');
  var year = null;
  var sd = String(media.startDate || '').slice(0, 4);
  if (/^\d{4}$/.test(sd)) year = parseInt(sd, 10);

  var genres = [];
  if (Array.isArray(media.genres)) {
    media.genres.forEach(function (g) {
      if (g && g.name) genres.push(clean(g.name));
    });
  }

  var animeUrl = BASE + '/media/' + slug;

  return {
    id: 'animeav1:' + slug,
    title: title,
    name: title,
    type: type,
    overview: overview,
    poster: poster,
    posterUrl: poster,
    image: poster,
    backdrop: absBackdrop(id),
    genres: genres,
    year: year,
    rating: null,
    extra: {
      source: 'animeav1',
      animeav1Slug: slug,
      animeav1Url: animeUrl,
      animeav1Id: id,
      tmdbId: animeUrl,
      mediaType: movie ? 'movie' : 'tv',
      status: clean((media.status && media.status.name) || media.status || ''),
      category: (media.category && media.category.name) || '',
    },
  };
}

// ─── LOAD HELPERS ────────────────────────────────────────

async function loadData(path) {
  var url = BASE + path + (path.indexOf('?') >= 0 ? '&' : path.endsWith('/') ? '' : '/') + '__data.json';
  // normalize: path already may have query
  if (path.indexOf('__data.json') >= 0) {
    url = BASE + path;
  } else if (path.indexOf('?') >= 0) {
    url = BASE + path.replace('?', '/__data.json?');
  } else {
    url = BASE + path + '/__data.json';
  }
  var body = await fetchJson(url);
  return loadPageData(body);
}

async function loadCatalog(opts) {
  opts = opts || {};
  var params = [];
  if (opts.search) params.push('search=' + encodeURIComponent(opts.search));
  if (opts.page && opts.page > 1) params.push('page=' + opts.page);
  if (opts.category) params.push('category=' + encodeURIComponent(opts.category));
  if (opts.genre) params.push('genre=' + encodeURIComponent(opts.genre));
  if (opts.year) params.push('year=' + encodeURIComponent(opts.year));
  if (opts.order) params.push('order=' + encodeURIComponent(opts.order));
  if (opts.status) params.push('status=' + encodeURIComponent(opts.status));

  var q = params.length ? '?' + params.join('&') : '';
  var data = await loadData('/catalogo' + q);
  if (!data) return { items: [], page: 1, totalPages: 1, total: 0 };

  var results = data.results || [];
  var items = [];
  for (var i = 0; i < results.length; i++) {
    var it = makeItem(results[i]);
    if (it) items.push(it);
  }

  var pag = data.pagination || {};
  return {
    items: items,
    page: pag.currentPage || opts.page || 1,
    totalPages: pag.totalPages || 1,
    total: data.total || items.length,
  };
}

// ─── GET HOME ────────────────────────────────────────────

async function getHome(args, config) {
  var rows = [];
  try {
    var data = await loadData('/');
    if (data) {
      // featured
      if (Array.isArray(data.featured) && data.featured.length) {
        var feat = [];
        data.featured.forEach(function (m) {
          var it = makeItem(m);
          if (it) feat.push(it);
        });
        if (feat.length) {
          rows.push({ id: 'animeav1-featured', title: 'Destacados', items: feat.slice(0, 20) });
        }
      }
      // latest media
      if (Array.isArray(data.latestMedia) && data.latestMedia.length) {
        var latest = [];
        data.latestMedia.forEach(function (m) {
          var it = makeItem(m);
          if (it) latest.push(it);
        });
        if (latest.length) {
          rows.push({ id: 'animeav1-latest', title: 'Últimos añadidos', items: latest.slice(0, 20) });
        }
      }
    }
  } catch (e) {}

  // Fallback / complement: pages from catalogo
  var extras = [
    { id: 'animeav1-tv', title: 'TV Anime', category: '1' },
    { id: 'animeav1-movies', title: 'Películas', category: '2' },
  ];
  for (var i = 0; i < extras.length; i++) {
    try {
      var cat = await loadCatalog({ page: 1, category: extras[i].category });
      if (cat.items && cat.items.length) {
        rows.push({
          id: extras[i].id,
          title: extras[i].title,
          items: cat.items.slice(0, 20),
        });
      }
    } catch (e) {}
  }

  // If still empty, plain catalogo
  if (rows.length === 0) {
    try {
      var all = await loadCatalog({ page: 1 });
      if (all.items && all.items.length) {
        rows.push({ id: 'animeav1-all', title: 'Catálogo', items: all.items.slice(0, 24) });
      }
    } catch (e) {}
  }

  return { rows: rows };
}

// ─── DISCOVER ────────────────────────────────────────────

async function discover(args, config) {
  var page = parseInt((args && (args.page || args.skip)) || 1, 10) || 1;
  var cat = (args && (args.category || args.tipo || args.type)) || '';
  var genero = (args && (args.genre || args.genero)) || '';
  var year = (args && args.year) || '';
  var order = (args && (args.order || args.orden)) || '';

  var opts = { page: page };
  var catL = String(cat).toLowerCase();

  // Map common category names/ids
  if (catL === 'movie' || catL === 'movies' || catL === 'peliculas' || catL === 'película') {
    opts.category = '2';
  } else if (catL === 'tv' || catL === 'series' || catL === 'anime' || catL === 'animes') {
    opts.category = '1';
  } else if (catL && /^\d+$/.test(catL)) {
    opts.category = catL;
  } else if (catL) {
    opts.category = catL;
  }

  if (genero) opts.genre = String(genero).toLowerCase().replace(/\s+/g, '-');
  if (year) opts.year = year;
  if (order) opts.order = order;

  var dir = await loadCatalog(opts);
  return {
    items: dir.items || [],
    page: dir.page,
    hasMore: dir.page < dir.totalPages,
  };
}

// ─── SEARCH ──────────────────────────────────────────────

async function search(args, config) {
  var q = (args && (args.query || args.q)) || '';
  q = String(q).trim();
  if (!q) return { items: [] };

  var all = [];
  var seen = {};
  var maxPages = 3;

  for (var p = 1; p <= maxPages; p++) {
    try {
      var res = await loadCatalog({ search: q, page: p });
      if (!res.items || !res.items.length) break;
      for (var i = 0; i < res.items.length; i++) {
        var it = res.items[i];
        if (it && it.id && !seen[it.id]) {
          seen[it.id] = true;
          all.push(it);
        }
      }
      if (p >= res.totalPages) break;
    } catch (e) {
      break;
    }
  }

  return { items: all.slice(0, 100) };
}

// ─── GET META + EPISODIOS ────────────────────────────────

async function getMeta(args, config) {
  var id = (args && (args.id || args.tmdbId || args.url)) || '';
  id = String(id).trim();
  if (!id) throw new Error('missing id');

  var slug = '';
  if (id.indexOf('animeav1:') === 0) {
    slug = id.split(':')[1] || '';
  } else if (id.indexOf('animeav1.com') >= 0) {
    var m = /\/media\/([^\/\?\#]+)/i.exec(id) || /animeav1\.com\/([^\/\?\#]+)/i.exec(id);
    if (m) slug = m[1];
  } else if (/^[a-z0-9][a-z0-9\-]*$/i.test(id)) {
    slug = id;
  }
  if (!slug) throw new Error('invalid animeav1 id: ' + id);

  var data = await loadData('/media/' + slug);
  if (!data || !data.media) throw new Error('not found: ' + slug);

  var media = data.media;
  var item = makeItem(media);
  if (!item) throw new Error('invalid media');

  // Episodes
  var episodes = [];
  var nums = [];
  if (Array.isArray(media.episodes)) {
    media.episodes.forEach(function (e) {
      var n = Number(e && e.number);
      if (Number.isInteger(n) && n >= 1 && nums.indexOf(n) < 0) nums.push(n);
    });
  }
  nums.sort(function (a, b) { return a - b; });

  var mid = String(media.id || '');
  for (var i = 0; i < nums.length; i++) {
    var num = nums[i];
    episodes.push({
      id: 'animeav1:' + slug + ':' + num,
      season: 1,
      episode: num,
      number: num,
      title: 'Episodio ' + num,
      name: 'Episodio ' + num,
      overview: '',
      still: mid ? CDN + '/screenshots/' + mid + '/' + num + '.jpg' : null,
      airDate: null,
      extra: {
        tmdbId: BASE + '/media/' + slug + '/' + num,
        animeav1Slug: slug,
        animeav1Episode: num,
      },
    });
  }

  // If movie and no episodes, fabricate one
  if (item.type === 'movie' && episodes.length === 0) {
    episodes.push({
      id: 'animeav1:' + slug + ':1',
      season: 1,
      episode: 1,
      number: 1,
      title: item.title,
      name: item.title,
      overview: item.overview,
      still: item.backdrop || item.poster,
      extra: {
        tmdbId: BASE + '/media/' + slug + '/1',
        animeav1Slug: slug,
        animeav1Episode: 1,
      },
    });
  }

  return {
    id: item.id,
    title: item.title,
    name: item.title,
    type: item.type,
    overview: item.overview,
    poster: item.poster,
    posterUrl: item.poster,
    image: item.poster,
    backdrop: item.backdrop,
    genres: item.genres,
    year: item.year,
    status: item.extra.status,
    totalEpisodes: episodes.length,
    episodes: episodes,
    extra: item.extra,
  };
}

module.exports = {
  getHome: getHome,
  search: search,
  discover: discover,
  getMeta: getMeta,
};

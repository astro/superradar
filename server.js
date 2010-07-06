var sys = require('sys'),
  config = require('./config'),
  xmpp = require('xmpp'),
  sqlite = require('sqlite');

process.addListener('uncaughtException', function(e) {
			sys.puts("Uncaught: "+e);
		    });

var db = new sqlite.Database();
db.query("PRAGMA synchronous=OFF", function() { });

/* max 2 bulk queries are running at a time */
var bulkQueue = [], bulkPending = 0;
function bulkQuery(qry, data) {
  if (bulkPending > 2) {
    bulkQueue.push({ qry: qry, data: data });
  } else {
    db.query(qry, data,
	     function() {
	       bulkPending--;
	       /* Check for queued bulk qrys */
	       var queued = bulkQueue.shift();
	       if (queued) {
		 bulkQuery(queued.qry, queued.data);
	       }
	     });
    bulkPending++;
  }
}
db.open("radar.db",
	function() {
	  db.query("CREATE TABLE items (serial INTEGER PRIMARY KEY AUTOINCREMENT, rss TEXT, id TEXT, date INT, content TEXT)", [],
		   function() {
		     sys.puts("CREATE -> " + JSON.stringify(arguments));
		     setupSuperfeedr();
		   });
	});


function setupSuperfeedr() {
  var conn = new xmpp.Client({ jid: config.Superfeedr.jid,
			       password: config.Superfeedr.password
			     });
  // TODO: hook 'error', 'authFail', 'end'
  conn.addListener('online',
		   function() {
		     conn.send(new xmpp.Element('presence'));
		   });
  conn.addListener('stanza', onSuperfeedrStanza);
}


function padLeft(len, padding, s) {
  s = s.toString();
  while(s.length < len) {
    s = padding + s;
  }
  return s;
}
Date.prototype.toISO8601 = function() {
sys.puts("toISO8601 of "+this);
  var tz = this.getTimezoneOffset();
  return this.getFullYear() + '-' +
    padLeft(2, '0', this.getMonth()) + '-' +
    padLeft(2, '0', this.getDay()) + 'T' +
    padLeft(2, '0', this.getHours()) + ':' +
    padLeft(2, '0', this.getMinutes()) + ':' +
    padLeft(2, '0', this.getSeconds()) +
    (tz >= 0 ? '+' : '-') +
    padLeft(2, '0', Math.abs(tz) / 60) + ':' +
    padLeft(2, '0', Math.abs(tz) % 60);
};


/*** Helpers for ATOM to JSON conversion */
function xmlToAttr(el, name, json) {
    var text = el.getChildText(name);
    if (text)
	json[name] = text;
}
function xmlAttrToAttr(el, name, json) {
    var text = el.attrs[name];
    if (text)
	json[name] = text;
}
function xmlToLink(linkEl) {
    var json = {};
    xmlAttrToAttr(linkEl, "rel", json);
    xmlAttrToAttr(linkEl, "href", json);
    xmlAttrToAttr(linkEl, "type", json);
    xmlAttrToAttr(linkEl, "title", json);
    return json;
}
function xmlToAuthor(authorEl) {
    var json = {};
    xmlToAttr(authorEl, "name", json);
    xmlToAttr(authorEl, "uri", json);
    xmlToAttr(authorEl, "email", json);
    return json;
}

function onSuperfeedrStanza(stanza) {
  if (stanza.is('message')) {
    var entries = [];
    stanza.getChildren("event").forEach(function(eventEl) {
      eventEl.getChildren("items").forEach(function(itemsEl) {
	var node = itemsEl.attrs.node;
	if (node) {
	  itemsEl.getChildren("item").forEach(function(itemEl) {
	    itemEl.getChildren("entry").forEach(function(entryEl) {
	      var json = {rss: node};
	      xmlToAttr(entryEl, "id", json);
	      xmlToAttr(entryEl, "title", json);
	      xmlToAttr(entryEl, "published", json);
	      xmlToAttr(entryEl, "content", json);
	      xmlToAttr(entryEl, "summary", json);
	      json['links'] = entryEl.getChildren("link").map(xmlToLink);
	      json['authors'] = entryEl.getChildren("author").map(xmlToAuthor);

	      entries.push(json);
	    });
	  });
	}
      });
    });
    onEntries(entries);
  }
}

/* A counter, for getEntriesSince() to determine whether to wait or
 * just retry the SQLite query.
 */
var entriesReceived = 0;

var onUpdateQueue = [];

function onEntries(entries) {
  sys.puts("onEntries() "+entries.length+" entries, "+onUpdateQueue.length+" queued");

  entriesReceived += entries.length;
  entries.forEach(function(entry) {
		    sys.puts(entry.rss+" "+entry.id+" "+entry.published);

		    if (isNaN(Date.parse(entry.published))) {
		      /* Fix published date so we have a date at all */
		      entry.published = new Date().toISO8601();
		      sys.puts("created: "+entry.published);
		    }

		    bulkQuery("INSERT INTO items (rss, id, date, content) VALUES (?, ?, ?, ?)",
			      [entry.rss, entry.id, entry.published, JSON.stringify(entry)]);
		  });

  /* Trigger waiting requests */
  if (entries.length > 0) {
    onUpdateQueue.forEach(function(f) {
			    sys.puts("onUpdate f()");
			    f();
			  });
    onUpdateQueue = [];
  }
}

function getEntriesSince(since, cb) {
  sys.puts("getEntriesSince("+since+", "+cb);
  var old_entriesReceived = entriesReceived;

  var since_ = Number(since);
  var entries = [];
  db.query("SELECT serial, content FROM items WHERE serial > ? ORDER BY serial DESC LIMIT 100",
	   [since_], function(error, row) {
	     if (row) {
	       /* Row */
	       try {
		 var entry = JSON.parse(row.content);
	       } catch (e) {
		 sys.puts("Error parsing content: "+e);
		 sys.puts(row.content);
		 return;
	       }
	       entry.serial = row.serial;
	       entries.push(entry);
	     } else {
	       /* Select finished */
	       if (entries.length > 0) {
		 /* Done, trigger callback */
		 cb(entries);
	       } else {
		 /* No entries */
		 if (old_entriesReceived == entriesReceived) {
		   onUpdateQueue.push(function() {
		     getEntriesSince(since, cb);
		   });
		 } else {
		   /* There were updates during the SELECT, retry immediately */
		   getEntriesSince(since, cb);
		 }
	       }
	     }
	   });
}


/* Web stuff */

require('express');
configure(function(){
	    set('root', __dirname);

	    require('express/express/plugins');
	    use(Static, { path: set('root') + '/public' });
	    use(require('express/express/plugins/redirect').Redirect);
	  });
get('/', function() {
      this.redirect("/public/index.html");
    });
get('/updates/:since', function(since) {
      var req = this;
      getEntriesSince(since, function(entries) {
			sys.puts("yielding "+entries.length+" entries since "+since);
			req.respond(200, JSON.stringify(entries));
		      });

    });
run();

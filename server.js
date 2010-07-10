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
function bulkQuery(qry, data, cb) {
  if (bulkPending > 1) {
    bulkQueue.push({ qry: qry, data: data, cb: cb });
  } else {
    db.query(qry, data,
	     function() {
	       bulkPending--;
	       cb && cb();

	       /* Check for queued bulk qrys */
	       var queued = bulkQueue.shift();
	       if (queued) {
		 bulkQuery(queued.qry, queued.data, queued.cb);
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


var NS_PUBSUB = 'http://jabber.org/protocol/pubsub';
var xmppConn = null, xmppId = 0, xmppReqs = {};
function setupSuperfeedr() {
  var conn = new xmpp.Client({ jid: config.Superfeedr.jid,
			       password: config.Superfeedr.password
			     });

  conn.addListener('online',
		   function() {
		     xmppConn = conn;
		     conn.send(new xmpp.Element('presence').c('priority').t('10'));
		   });
  conn.addListener('stanza', onSuperfeedrStanza);

  var retry = function() {
    xmppConn = null;
    for(var id in xmppReqs) {
      xmppReqs[id](false);
    }
    xmppReqs = {};

    setTimeout(setupSuperfeedr, 1000);
  };
  conn.addListener('error', retry);
  conn.addListener('end', retry);
}
function subscribe(url, cb) {
  if (xmppConn) {
    xmppId++;
    xmppConn.send(new xmpp.Element('iq', { to: "firehoser.superfeedr.com",
					   type: "set",
					   id: xmppId }).
			  c("pubsub", { xmlns: NS_PUBSUB }).
			  c("subscribe", { node: url,
					  jid: xmppConn.jid.bare().toString()
					 }));
    xmppReqs[xmppId] = cb;
  } else {
    sys.puts("Subscribe request but XMPP not ready");
    cb(false);
  }
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
    padLeft(2, '0', this.getMonth() + 1) + '-' +
    padLeft(2, '0', this.getDate()) + 'T' +
    padLeft(2, '0', this.getHours()) + ':' +
    padLeft(2, '0', this.getMinutes()) + ':' +
    padLeft(2, '0', this.getSeconds()) +
    (tz >= 0 ? '-' : '+') +
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
    var feedTitle = null;
    var entries = [];
    stanza.getChildren("event").forEach(function(eventEl) {
      eventEl.getChildren("status").forEach(function(statusEl) {
        feedTitle = statusEl.getChildText("title");
	if (feedTitle.toString().length == 0)
	  feedTitle = null;
      });

      eventEl.getChildren("items").forEach(function(itemsEl) {
	var node = itemsEl.attrs.node;
	if (node) {
	  itemsEl.getChildren("item").forEach(function(itemEl) {
	    itemEl.getChildren("entry").forEach(function(entryEl) {
	      var json = { rss: node };
	      if (feedTitle)
		json.feedTitle = feedTitle;
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
  } else if (stanza.is('iq')) {
    var id = stanza.attrs['id'];
    var type = stanza.attrs['type'];
    if (xmppReqs[id]) {
      if (type == 'error')
	sys.puts("Reply: " + stanza.toString());
      xmppReqs[id](type == 'result');
      delete xmppReqs[id];
    }
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
  /* For superfeedr there's always 1 notification per rss url */
  if (entries[0])
    bulkQuery("DELETE FROM items WHERE rss LIKE ? AND serial < " +
	      "(SELECT serial FROM items WHERE rss LIKE ? ORDER BY serial DESC LIMIT 1 OFFSET 9)",
	      [entries[0].rss, entries[0].rss],
	      function() {
		/* Trigger waiting requests */
		if (entries.length > 0) {
		  onUpdateQueue.forEach(function(f) { f(); });
		  onUpdateQueue = [];
		}
	      });
}

function getEntriesSince(since, cb) {
  var old_entriesReceived = entriesReceived;

  var since_ = Number(since);
  var entries = [];
  db.query("SELECT serial, content FROM items WHERE serial > ? ORDER BY serial DESC LIMIT 30",
	   [since_], function(error, row) {
	     if (row) {
	       /* Row */
	       try {
		 var entry = JSON.parse(row.content);
		 /* Save bandwidth for this request: */
		 delete entry.content;
		 delete entry.summary;
	       } catch (e) {
		 sys.puts("Error parsing content: "+e);
		 sys.puts(row.content);
		 return;
	       }
	       entry.serial = row.serial;
	       entries.push(entry);
	     } else if (!error) {
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
	     } else
	       throw error;
	   });
}


/* Web stuff */

require('express');
use(Logger, { format: 'combined' });
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

function adminCheck(req) {
  var admin = config.adminCheck(req.socket.remoteAddress);
  if (admin) {
    var xff = req.headers['x-forwarded-for'];
    if (xff)
      admin = config.adminCheck(xff);
  }
  return admin ? true : false;
}

get('/admincheck', function() {
      this.respond(200, JSON.stringify(adminCheck(this)));
    });
get('/subscribe', function() {
       if (adminCheck(this)) {
	 var req = this;
	 var url = this.param('url');
	 subscribe(url, function(success) {
		     req.respond(success ? 200 : 500);
		   });
       } else
	 this.respond(403, '');
});
run();

var expat = require('node-expat');
var xmpp = require('xmpp');
var http = require('http');
var url = require('url');

function padLeft(len, padding, s) {
  s = s.toString();
  while(s.length < len) {
    s = padding + s;
  }
  return s;
}
Date.prototype.toISO8601 = function() {
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

exports.extractFeed = function(tree) {
    var rss = null;
    var entries = [];

    tree.getChildren("link").forEach(function(linkEl) {
	if (!rss && linkEl.attrs.rel === 'self')
	    rss = linkEl.attrs.href;
    });
    tree.getChildren("entry").forEach(function(entryEl) {
	var json = { rss: rss };
	xmlToAttr(entryEl, "id", json);
	xmlToAttr(entryEl, "title", json);
	xmlToAttr(entryEl, "published", json);
	xmlToAttr(entryEl, "content", json);
	xmlToAttr(entryEl, "summary", json);
	json['links'] = entryEl.getChildren("link").map(xmlToLink);
	json['authors'] = entryEl.getChildren("author").map(xmlToAuthor);

	entries.push(json);
    });
    return { rss: rss, entries: entries };
}

exports.parse = function(cb) {
    var parser = new expat.Parser('UTF-8');
    var element, tree;
    parser.addListener('startElement', function(name, attrs) {
        var child = new xmpp.Element(name, attrs);
        if (!element) {
	    element = child;
        } else {
	    element = element.cnode(child);
        }
    });
    parser.addListener('endElement', function(name, attrs) {
        if (!element) {
	    /* Err */
        } else if (element && name == element.name) {
            if (element.parent)
                element = element.parent;
            else if (element && !tree) {
		tree = element;
		element = undefined;
            }
        }
    });
    parser.addListener('text', function(str) {
        if (element)
            element.t(str);
    });

    return { write: function(data) {
		 if (!parser.parse(data, false))
		     cb(new Error(parser.getError()));
	     },
	     end: function() {
		 if (!parser.parse('', true))
		     cb(new Error(parser.getError()));
		 else
		     cb(null, tree);
	     }
	   };
};

exports.fetch = function(uri, cb) {
  var hu = url.parse(uri);
  var cl = http.createClient(hu.port || 80, hu.hostname);
  var req = cl.request('GET', hu.pathname, { 'Accept': 'application/atom+xml',
					     'Host': hu.host
					   });
  req.end();

  req.on('response', function(res) {
    var p = exports.parse(cb);
    res.setEncoding('utf-8');
    res.on('data', function(data) {
      p.write(data);
    });
    res.on('end', function() {
      p.end();
    });
  });
  req.on('error', cb);
};

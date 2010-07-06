function receiveContent(content) {
    console.log("receiveContent "+content.length);
    var entries = JSON.parse(content);
    var serial = 0;
    console.log(entries.length + " entries pulled");

    /* Add each entry */
    $.map(entries,
	  function(entry) {
	      if (entry.serial > serial)
		  serial = entry.serial;

	      var p = $('<p/>');
	      p.data('rss', entry.rss);
	      p.data('id', entry.id);
	      p.data('published', new Date(entry.published));
	      console.log(entry.published+" -> "+new Date(entry.published));
	      p.data('serial', entry.serial);
	      p.text(entry.published+' — '+entry.title);
	      p.hide();
	      var preceding = 'h1', done = false;
	      $('p').map(function() {
			     if (!done) {
				 var p1 = $(this);
				 var published = p1.data('published');
				 if (published) {
				     console.log(published.getTime()+':'+published+' < '+p.data('published').getTime()+':'+p.data('published'));
				     if (published.getTime() < p.data('published').getTime())
					 preceding = p1;
				     else
					 done = true;
				 } else {
				     // FIX:
				     console.log('p w/o data: '+ps[ps1]);
				 }
			     }
			 });
	      p.insertAfter(preceding);
	      p.slideDown(500);
	  });

    /* Drop old */
    $('p').each(function() {
		    var p = $(this);
		    var pSerial = p.data('serial');
		    if (pSerial && pSerial < serial - 100)
			p.remove();
		});

    /* Get next */
    window.setTimeout(function() {
			  pull(serial);
		      }, 100);
}

function pull(serial) {
  console.log("pull("+serial+")");
  $.ajax({ url: '/updates/' + serial,
	   success: function(content) {
	       try {
		   receiveContent(content);
	       } catch (e) {
		   console.log("Error: " + e);
		   window.setTimeout(function() {
					 pull(serial);
				     }, 1000);
	       }
	   },
	   error: function(req, status) {
	       console.log("Error: " + status);
	       window.setTimeout(function() {
				     pull(serial);
				 }, 1000);
	   }
	 });
}

$(document).ready(function() {
		    pull(-1);
		  });

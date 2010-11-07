exports.superHub = 'http://user:pass@superfeedr.com/hubbub';
exports.pshb = {
  host: 'newsroom.spaceboyz.net',
  path: '/hub'
};
exports.adminCheck = function(addr) {
  return (/^(127\.|172\.22\.|2001:6f8:1194:c3d2:)/).test(addr);
};
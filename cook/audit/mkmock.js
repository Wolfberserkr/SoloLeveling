// Builds audit_page.html: same page, with a mock connector that records every SQL query.
const fs = require('fs');
const src = fs.readFileSync('mock_hr.js', 'utf8');
// reuse the data-building part of mock_hr.js (everything before "const stub")
const head = src.slice(0, src.indexOf('const stub = '));
const mod = new Function('require', head + '; return { payload, html };');
const { payload, html } = mod(require);
const stub = `<script>
window.__q=[];window.__fail=null;window.__rows=null;
window.__hr=function(){var n=Date.now(),v=[];for(var i=200;i>=12;i--)v.push([n-i*120000,62+Math.round(10*Math.abs(Math.sin(i/9)))]);return {restingHeartRate:63,heartRateValues:v}};
window.__dash=${JSON.stringify(payload).replace(/</g, "\\u003c")};
function __wrap(rows){return {result:'x\\n\\n<untrusted-data-abc-123>\\n'+JSON.stringify(rows)+'\\n</untrusted-data-abc-123>\\n\\ny'}}
window.claude={use:function(n){return Promise.resolve(n==='mcp'?{
  watchTool:function(sv,t,i,h){setTimeout(function(){h({type:'data',result:{content:[],payload:window.__hr()}})},50);return function(){}},
  callTool:function(sv,tool,args){
    if(sv==='Garmin')return Promise.resolve({content:[],payload:window.__hr()});
    var q=(args&&args.query)||'';window.__q.push(q);
    if(window.__fail){var e=window.__fail;return Promise.reject(e)}
    if(/^\\s*update /i.test(q))return Promise.resolve({content:[],payload:__wrap(window.__rows||[{id:'00000000-0000-4000-8000-000000000001'}])});
    return Promise.resolve({content:[],payload:window.__dash})}}
  :n==='sample'?function(a){window.__sample=a;return Promise.resolve({text:'Mock answer from Jarvis.',truncated:false})}:null)}};
</script>`;
fs.writeFileSync('audit_page.html', '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + stub + html + '</body></html>');
console.log('audit_page.html written');

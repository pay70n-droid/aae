var fs=require('fs');
var c=fs.readFileSync('scraper.js','utf8');
var lines=c.split('\n');
for(var i=0;i<lines.length;i++){
  var L=lines[i];
  if(L.indexOf('itemRe')>-1){lines[i]='      var parts=xml.split(String.fromCharCode(60)+"item"+String.fromCharCode(62));';continue;}
  if(L.indexOf('while ((m = itemRe')>-1){lines[i]='      for(var pi=1;pi<parts.length;pi++){var closeI=parts[pi].indexOf(String.fromCharCode(60)+"/item"+String.fromCharCode(62));var item=closeI>-1?parts[pi].substring(0,closeI):parts[pi];';continue;}
  if(L.indexOf('const item = m[1]')>-1){lines[i]='';continue;}
  if(L.indexOf('titleM')>-1&&L.indexOf('match')>-1){lines[i]='        var t1=item.split(String.fromCharCode(60)+"title"+String.fromCharCode(62));var titleM={1:t1[1]?(t1[1].split(String.fromCharCode(60)+"/title"+String.fromCharCode(62))[0]).replace("<![CDATA[","").split("]]>")[0]:""};';continue;}
  if(L.indexOf('linkM')>-1&&L.indexOf('match')>-1){lines[i]='        var l1=item.split(String.fromCharCode(60)+"link"+String.fromCharCode(62));var linkM={1:l1[1]?(l1[1].split(String.fromCharCode(60)+"/link"+String.fromCharCode(62))[0]).trim():""};';continue;}
  if(L.indexOf('descM')>-1&&L.indexOf('match')>-1){lines[i]='        var d1=item.split(String.fromCharCode(60)+"description"+String.fromCharCode(62));var descM={1:d1[1]?(d1[1].split(String.fromCharCode(60)+"/description"+String.fromCharCode(62))[0]).replace("<![CDATA[","").split("]]>")[0]:""};';continue;}
}
fs.writeFileSync('scraper.js',lines.join('\n'),'utf8');
console.log('Fixed scraper.js');
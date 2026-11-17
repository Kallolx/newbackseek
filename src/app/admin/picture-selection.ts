export function appendPictures(current:File[],selected:File[],savedCount=0) {
 const accepted=[...current];let invalid=0,overflow=0;
 for(const file of selected){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||!file.size||file.size>5*1024*1024){invalid++;continue;}
  if(accepted.some(item=>item.name===file.name&&item.size===file.size&&item.lastModified===file.lastModified))continue;
  if(accepted.length+savedCount>=6){overflow++;continue;}
  accepted.push(file);
 }
 return {files:accepted,invalid,overflow};
}

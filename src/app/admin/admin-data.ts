export type LocationCountry={code:string;name:string;regions:{name:string;id:string;cities:{name:string;id:string}[]}[]};
export type CategoryGroup={name:string;services:{name:string;slug:string}[]};
export type AdStatus='Published'|'Pending'|'Paused'|'Rejected'|'Draft';
export type Ad={id:number;title:string;description:string;descriptionHtml?:string;age?:number;location?:string;phone?:string;email?:string;images?:string[];category:string;owner:string;targets:string[];status:AdStatus;updated:string;bumped?:boolean};
export const adStatuses:AdStatus[]=['Published','Pending','Paused','Rejected','Draft'];
export const statusColor=(status:string)=>({published:'teal',active:'teal',approved:'teal',pending:'orange',open:'orange',paused:'gray',suspended:'red',rejected:'red',deleted:'red',ready:'teal',failed:'red'}[status.toLowerCase()]||'blue');

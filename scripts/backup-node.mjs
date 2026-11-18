import {DatabaseSync,backup} from 'node:sqlite';
import {mkdir,readdir,unlink,chmod} from 'node:fs/promises';
import {resolve,basename,isAbsolute} from 'node:path';
process.umask(0o077);
const source=process.env.DMS_DATABASE_PATH;
const directory='/var/backups/discount-mobility-scooter';
if(!source||!isAbsolute(source))throw new Error('An absolute DMS_DATABASE_PATH is required.');
await mkdir(directory,{recursive:true,mode:0o700});
const name=`store-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`;
const db=new DatabaseSync(source,{readOnly:true});
try{await backup(db,resolve(directory,name));await chmod(resolve(directory,name),0o600);}finally{db.close();}
const files=(await readdir(directory)).filter(name=>/^store-\d{4}-\d{2}-\d{2}T[\dTZ-]+\.sqlite$/.test(name)).sort().reverse();
for(const stale of files.slice(14)){const target=resolve(directory,stale);if(basename(target)===stale&&target.startsWith(directory+'/'))await unlink(target);}
console.log('Consistent database backup completed.');

import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir,mkdir} from 'node:fs/promises';
export async function localDatabase(filename){
 const sqlite=new DatabaseSync(filename);sqlite.exec('PRAGMA foreign_keys=ON');
 sqlite.exec('CREATE TABLE IF NOT EXISTS __local_migrations(name TEXT PRIMARY KEY)');
 for(const file of (await readdir('drizzle')).filter(x=>x.endsWith('.sql')).sort())if(!sqlite.prepare('SELECT name FROM __local_migrations WHERE name=?').get(file)){sqlite.exec('BEGIN');try{sqlite.exec(await readFile('drizzle/'+file,'utf8'));sqlite.prepare('INSERT INTO __local_migrations VALUES(?)').run(file);sqlite.exec('COMMIT');}catch(error){sqlite.exec('ROLLBACK');throw error;}}
 const execute=(sql,args,kind)=>{const stmt=sqlite.prepare(sql);if(kind==='first')return stmt.get(...args)||null;if(kind==='all')return {results:stmt.all(...args)};const r=stmt.run(...args);return {success:true,meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};};
 const prepared=(sql,args=[])=>({sql,args,bind(...values){return prepared(sql,values)},async first(){return execute(sql,args,'first')},async all(){return execute(sql,args,'all')},async run(){return execute(sql,args,'run')}});
 // Mirrors server/db.mjs so the same code path runs against the preview
 // database and against Postgres. See the comment there for why a transaction
 // whose body can throw is needed in addition to batch().
 async function transaction(fn){
  sqlite.exec('BEGIN');
  try{
   const result=await fn({
    async run(sql,...args){return execute(sql,args,'run');},
    async first(sql,...args){return execute(sql,args,'first');},
   });
   sqlite.exec('COMMIT');
   return result;
  }catch(error){sqlite.exec('ROLLBACK');throw error;}
 }
 return {prepare:prepared,transaction,async batch(statements){sqlite.exec('BEGIN');try{const results=statements.map(s=>execute(s.sql,s.args,'run'));sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}},close(){sqlite.close();}};
}

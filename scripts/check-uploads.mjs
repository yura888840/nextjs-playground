import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { query } from '../lib/db.js';
import { createTestAccount } from './test-account.mjs';
import { maxAttachmentBytes } from '../lib/attachment-policy.js';

export async function checkUploads(origin) {
  const accounts = [];
  try {
    const a = await createTestAccount(origin); accounts.push(a);
    const b = await createTestAccount(origin); accounts.push(b);
    const taskId = randomUUID(); const otherTaskId = randomUUID(); const quotaTaskId = randomUUID();
    for (const [id,owner] of [[taskId,a.user.id],[otherTaskId,b.user.id],[quotaTaskId,a.user.id]]) {
      await query('INSERT INTO tasks(id,owner_id,title) VALUES($1,$2,$3)', [id,owner,'Attachment test']);
    }
    const base = `/api/tasks/${taskId}/attachments`;
    const request = (path, options = {}, cookie = a.cookie) => fetch(`${origin}${path}`, {
      ...options, headers: { Cookie: cookie, Origin: origin, ...options.headers }, signal: AbortSignal.timeout(10000),
    });
    const form = (bytes='Hello attachment',name='notes.txt',type='text/plain') => {
      const data = new FormData(); data.append('file',new Blob([bytes],{type}),name); return data;
    };
    const upload = (body=form(), path=base, cookie=a.cookie) => request(path,{method:'POST',body},cookie);
    assert.equal((await request(base,{},'')).status,401);
    assert.equal((await upload(form(),base,'')).status,401);
    assert.equal((await upload(form(),base,b.cookie)).status,404);
    assert.equal((await request(base,{},b.cookie)).status,404);
    assert.equal((await request(base,{method:'POST',body:form(),headers:{Origin:'https://evil.example'}})).status,403);
    assert.equal((await request(base,{method:'POST',body:'{}',headers:{'Content-Type':'application/json'}})).status,415);
    assert.equal((await request(base,{method:'POST',body:'broken',headers:{'Content-Type':'multipart/form-data; boundary=missing'}})).status,400);
    const duplicate=form(); duplicate.append('file',new Blob(['extra'],{type:'text/plain'}),'extra.txt');
    const extra=form(); extra.append('owner_id',b.user.id);
    for (const body of [new FormData(),duplicate,extra,form('','empty.txt'),form('wrong','fake.png','image/png'),form('<svg/>','image.svg','image/svg+xml'),form('text','notes.txt','application/pdf'),form(Buffer.from([0,255]),'binary.txt')]) {
      assert.equal((await upload(body)).status,422);
    }
    assert.equal((await upload(form(Buffer.alloc(maxAttachmentBytes+1,65)))).status,413);
    // Stream without Content-Length: the actual byte count must enforce the body limit.
    const boundary='upload-test';
    const huge=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="big.txt"\r\nContent-Type: text/plain\r\n\r\n`));controller.enqueue(new Uint8Array(maxAttachmentBytes+17000));controller.close();}});
    assert.equal((await request(base,{method:'POST',body:huge,duplex:'half',headers:{'Content-Type':`multipart/form-data; boundary=${boundary}`}})).status,413);
    const created=await upload(form('Hello attachment','résumé.txt'));
    assert.equal(created.status,201); const file=await created.json(); const path=`${base}/${file.id}`;
    assert.equal(created.headers.get('location'),path); assert.equal(file.content,undefined); assert.equal(file.filename,'résumé.txt');
    const list=await request(base); const items=(await list.json()).attachments;
    assert.equal(items.length,1); assert.equal(items[0].size,16);
    const download=await request(path);
    assert.equal(download.status,200); assert.equal(await download.text(),'Hello attachment');
    assert.equal(download.headers.get('content-type'),'application/octet-stream');
    assert.equal(download.headers.get('x-content-type-options'),'nosniff');
    assert.match(download.headers.get('content-disposition'),/^attachment;/);
    assert.match(download.headers.get('content-disposition'),/filename\*=UTF-8''r%C3%A9sum%C3%A9.txt/);
    assert.match(download.headers.get('cache-control'),/no-store/);
    assert.match(download.headers.get('content-security-policy'),/sandbox/);
    for(const method of ['GET','DELETE']) {
      assert.equal((await request(path,{method},b.cookie)).status,404);
      assert.equal((await request(path,{method},'')).status,401);
      assert.equal((await request(`/api/tasks/${otherTaskId}/attachments/${file.id}`,{method})).status,404);
    }
    assert.equal((await request(`${base}/invalid`)).status,400);
    assert.equal((await request(path,{method:'DELETE',headers:{Origin:'https://evil.example'}})).status,403);
    // Stored bytes must be available from a different Node process, not from memory.
    const persisted=spawnSync(process.execPath,['--input-type=module','-e',`import {getAttachment} from './lib/attachment-store.js'; const row=await getAttachment(${JSON.stringify(taskId)},${JSON.stringify(file.id)},${JSON.stringify(a.user.id)}); console.log(row.content.toString());`],{env:process.env,encoding:'utf8',timeout:15000});
    assert.equal(persisted.status,0,persisted.stderr); assert.equal(persisted.stdout.trim(),'Hello attachment');
    // Accepted binary signatures and the exact size boundary preserve bytes.
    for (const [bytes,name,type] of [
      [Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS2kAAAAASUVORK5CYII=','base64'),'pixel.png','image/png'],
      [Buffer.from('%PDF-1.4\n%%EOF'),'document.pdf','application/pdf'],
      [Buffer.from([255,216,255,224,0,2,255,217]),'signature.jpg','image/jpeg'],
      [Buffer.alloc(maxAttachmentBytes,65),'boundary.txt','text/plain'],
    ]) {
      const response=await upload(form(bytes,name,type)); assert.equal(response.status,201);
      const added=await response.json(); const target=`${base}/${added.id}`;
      assert.deepEqual(Buffer.from(await (await request(target)).arrayBuffer()),bytes);
      assert.equal((await request(target,{method:'DELETE'})).status,204);
    }
    // Fill all but one slot, then race two uploads: exactly one can occupy the final slot.
    for(let i=0;i<8;i++) assert.equal((await upload()).status,201);
    const raced=await Promise.all([upload(),upload()]);
    assert.deepEqual(raced.map(r=>r.status).sort(),[201,409]);
    assert.equal((await (await request(base)).json()).attachments.length,10);
    assert.equal((await request(path,{method:'DELETE'})).status,204);
    assert.equal((await request(path)).status,404);
    assert.equal((await upload()).status,201,'Deletion frees the task quota');
    assert.equal((await request(`/api/tasks/${taskId}`,{method:'DELETE'})).status,204);
    assert.equal((await query('SELECT count(*)::int AS count FROM task_attachments WHERE task_id=$1',[taskId])).rows[0].count,0);
    assert.equal((await request(path)).status,404);
    // Account quota spanning tasks, using direct test fixtures to avoid 20 HTTP uploads.
    const big=Buffer.alloc(maxAttachmentBytes,65);
    for(let i=0;i<20;i++) await query('INSERT INTO task_attachments(id,task_id,filename,media_type,size,content) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),quotaTaskId,'quota.txt','text/plain',big.length,big]);
    const freshTaskId=randomUUID(); await query('INSERT INTO tasks(id,owner_id,title) VALUES($1,$2,$3)',[freshTaskId,a.user.id,'Account quota']);
    const quota=await upload(form(),`/api/tasks/${freshTaskId}/attachments`); assert.equal(quota.status,409); assert.equal((await quota.json()).error.code,'ATTACHMENT_QUOTA');
    assert.equal((await upload(form(),`/api/tasks/${otherTaskId}/attachments`,b.cookie)).status,201,'Another owner has a separate quota');
    console.log('Passed: uploads, downloads, type/size checks, bounded chunked requests, ownership, CSRF, persistence, concurrent quotas and cascading deletion.');
  } finally { for(const account of accounts) await account.cleanup(); }
}

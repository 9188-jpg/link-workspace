export function apiExamples(origin:string){return {
 JavaScript:`import {createHash, createHmac, randomUUID} from 'node:crypto';
const appId = 'YOUR_APP_ID';
const appSecret = 'YOUR_APP_SECRET'; // 只保存在你自己的服务端
const path = '/api/openapi/shortlink/generate';
const body = JSON.stringify({target:'https://example.com/',mode:'page'});
const timestamp = String(Math.floor(Date.now()/1000));
const nonce = randomUUID();
const canonical = ['POST',path,timestamp,nonce,
  createHash('sha256').update(body).digest('hex')].join('\\n');
const signature = createHmac('sha256',appSecret).update(canonical).digest('hex');
const response = await fetch(${JSON.stringify(origin)}+path,{
  method:'POST',
  headers:{'Content-Type':'application/json','X-App-Id':appId,
    'X-App-Timestamp':timestamp,'X-App-Nonce':nonce,'X-App-Signature':signature},
  body
});
console.log(response.status,await response.json());`,
 Python:`import json, time, uuid, hashlib, hmac, urllib.request
app_id = 'YOUR_APP_ID'
app_secret = 'YOUR_APP_SECRET'
path = '/api/openapi/shortlink/generate'
body = json.dumps({'target':'https://example.com/','mode':'page'},
                  separators=(',',':')).encode('utf-8')
timestamp = str(int(time.time()))
nonce = str(uuid.uuid4())
canonical = '\\n'.join(['POST',path,timestamp,nonce,
                         hashlib.sha256(body).hexdigest()])
signature = hmac.new(app_secret.encode(),canonical.encode(),hashlib.sha256).hexdigest()
request = urllib.request.Request(${JSON.stringify(origin)}+path,data=body,method='POST',headers={
  'Content-Type':'application/json','X-App-Id':app_id,
  'X-App-Timestamp':timestamp,'X-App-Nonce':nonce,'X-App-Signature':signature})
with urllib.request.urlopen(request) as response:
    print(response.read().decode('utf-8'))`,
 PowerShell:`$appId = 'YOUR_APP_ID'
$appSecret = 'YOUR_APP_SECRET'
$path = '/api/openapi/shortlink/generate'
$body = @{target='https://example.com/';mode='page'} | ConvertTo-Json -Compress
$bodyBytes = [Text.Encoding]::UTF8.GetBytes($body)
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
$nonce = [Guid]::NewGuid().ToString()
$sha = [Security.Cryptography.SHA256]::Create()
$bodyHash = [BitConverter]::ToString($sha.ComputeHash($bodyBytes)).Replace('-','').ToLower()
$canonical = [string]::Join([char]10,@('POST',$path,$timestamp,$nonce,$bodyHash))
$hmac = New-Object Security.Cryptography.HMACSHA256
$hmac.Key = [Text.Encoding]::UTF8.GetBytes($appSecret)
$signature = [BitConverter]::ToString($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($canonical))).Replace('-','').ToLower()
$headers = @{'X-App-Id'=$appId;'X-App-Timestamp'=$timestamp;'X-App-Nonce'=$nonce;'X-App-Signature'=$signature}
Invoke-RestMethod -Uri (${JSON.stringify(origin)}+$path) -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $bodyBytes`
};}

import QRCode from 'qrcode';
export function artSvg(value:string,{dark='#26324a',light='#ffffff',margin=4,ecc='H',shape='square',eyes='square',logo=''}:{dark?:string;light?:string;margin?:number;ecc?:'L'|'M'|'Q'|'H';shape?:string;eyes?:string;logo?:string}){
 if(!/^#[0-9a-f]{6}$/i.test(dark)||!/^#[0-9a-f]{6}$/i.test(light))throw new Error('颜色格式不正确');
 if(logo&&!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(logo))throw new Error('Logo 需为本地图片');
 const code=QRCode.create(value,{errorCorrectionLevel:logo?'H':ecc}),matrix=code.modules,n=matrix.size,m=Math.max(4,margin),size=n+m*2;let modules='';
 const finder=(r:number,c:number)=>(r<7&&c<7)||(r<7&&c>=n-7)||(r>=n-7&&c<7);
 for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(matrix.get(r,c)&&!finder(r,c)){const x=c+m,y=r+m;modules+=shape==='dots'?`<circle cx="${x+.5}" cy="${y+.5}" r=".49"/>`:`<rect x="${x}" y="${y}" width="1" height="1"${shape==='rounded'?' rx=".22"':''}/>`;}
 let corners='';for(const [x,y] of [[m,m],[m+n-7,m],[m,m+n-7]])corners+=`<rect x="${x}" y="${y}" width="7" height="7" fill="${dark}" rx="${eyes==='rounded'?1.2:0}"/><rect x="${x+1}" y="${y+1}" width="5" height="5" fill="${light}" rx="${eyes==='rounded'?.7:0}"/><rect x="${x+2}" y="${y+2}" width="3" height="3" fill="${dark}" rx="${eyes==='rounded'?.5:0}"/>`;
 const logoSize=n*.13,x=(size-logoSize)/2;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${light}"/><g fill="${dark}">${modules}</g>${corners}${logo?`<rect x="${x-.7}" y="${x-.7}" width="${logoSize+1.4}" height="${logoSize+1.4}" rx=".6" fill="${light}"/><image href="${logo}" x="${x}" y="${x}" width="${logoSize}" height="${logoSize}"/>`:''}</svg>`;
}
export async function svgPng(svg:string,size=512){const url='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg)));const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('二维码图片未能加载'));image.src=url;});const canvas=document.createElement('canvas');canvas.width=canvas.height=size;canvas.getContext('2d')!.drawImage(image,0,0,size,size);return canvas.toDataURL('image/png');}
export async function prepareImage(file:File,maxBytes=140000){
 if(!/^image\/(png|jpeg|webp)$/.test(file.type))throw new Error('请选择 PNG、JPEG 或 WebP 图片');
 if(file.size>20*1024*1024)throw new Error('原图最大 20 MB');

 // Decode the local file directly so compression works under the admin page's image policy.
 const image=typeof createImageBitmap==='function'
  ? await createImageBitmap(file).catch(()=>{throw new Error('无法解码这张图片，请检查文件是否损坏');})
  : await new Promise<HTMLImageElement>((resolve,reject)=>{
   const reader=new FileReader();
   reader.onerror=()=>reject(new Error('无法读取本地图片'));
   reader.onload=()=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error('无法解码这张图片，请检查文件是否损坏'));
    img.src=String(reader.result);
   };
   reader.readAsDataURL(file);
  });
 try{
  const canvas=document.createElement('canvas');
  const ratio=Math.min(1,1280/Math.max(image.width,image.height));
  canvas.width=Math.max(1,Math.round(image.width*ratio));
  canvas.height=Math.max(1,Math.round(image.height*ratio));
  canvas.getContext('2d')!.drawImage(image,0,0,canvas.width,canvas.height);
  for(const quality of [.85,.7,.55,.4]){
   const data=canvas.toDataURL('image/webp',quality);
   if(atob(data.split(',')[1]).length<=maxBytes)return data;
  }
  throw new Error('压缩后仍过大，请缩小图片后上传');
 }finally{
  if('close' in image)image.close();
 }
}

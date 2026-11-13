"use client";

import {useEffect, useState} from "react";
import {ArrowUpRight, ChevronLeft, ChevronRight, ImageOff} from "lucide-react";
import type {PublicProduct as Product} from "@/lib/types";
import {imageIdentity, uniqueGallery} from "@/lib/gallery-policy";

export default function ProductGallery({product}:{product:Product}) {
  const images=uniqueGallery(product.image,product.images);
  const [index,setIndex]=useState(0);
  const [failed,setFailed]=useState(false);
  const galleryKey=images.join("\n");
  const current=index<images.length?index:0;
  const src=images[current]||product.image;
  const detail=product.imageDetails?.find(item=>imageIdentity(item.src)===imageIdentity(src));
  const alt=detail?.alt||`${product.name} — product photo ${current+1}`;
  function select(next:number){setIndex((next+images.length)%images.length);setFailed(false);}
  useEffect(()=>{setIndex(0);setFailed(false);},[galleryKey]);

  return <section className="product-gallery" aria-label={`${product.name} photo gallery`} tabIndex={0} onKeyDown={event=>{
    if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
    if(event.key==="ArrowRight"){event.preventDefault();select(current+1);}
    if(event.key==="ArrowLeft"){event.preventDefault();select(current-1);}
    if(event.key==="Home"){event.preventDefault();select(0);}
    if(event.key==="End"){event.preventDefault();select(images.length-1);}
  }}>
    <div className="gallery-stage">
      {failed?<div className="gallery-unavailable" role="status"><ImageOff/><span>This photo could not load. Choose another view.</span></div>:<img key={src} className="gallery-main-image" src={src} alt={alt} decoding="async" onError={()=>setFailed(true)}/>}
      {images.length>1&&<><button className="gallery-arrow gallery-previous" onClick={()=>select(current-1)} aria-label="Previous product photo"><ChevronLeft size={22}/></button><button className="gallery-arrow gallery-next" onClick={()=>select(current+1)} aria-label="Next product photo"><ChevronRight size={22}/></button></>}
    </div>
    <div className="gallery-meta"><span aria-live="polite" aria-atomic="true">Photo {current+1} of {images.length}</span><a href={src} target="_blank" rel="noopener noreferrer">View full size <ArrowUpRight size={14}/></a></div>
    {detail?.caption&&<p className="gallery-caption">{detail.caption}</p>}
    <div className="gallery-thumbnails" aria-label="Choose a product photo">{images.map((image,i)=><button key={imageIdentity(image)} type="button" className={current===i?"is-selected":""} aria-label={`View photo ${i+1} of ${images.length}`} aria-pressed={current===i} onClick={()=>select(i)}><img src={image} alt="" loading="lazy" decoding="async"/><span>{i+1}</span></button>)}</div>
    <p className="gallery-configuration">Colors and optional accessories shown may vary. Confirm the configuration in your quote.</p>
  </section>;
}

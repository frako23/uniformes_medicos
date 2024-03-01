import React, { useState } from 'react'

interface Producto {
    color: string;
    fotos: string[];
    genero: string;
    precio: string;
    id: string;
  }


export default function InteractiveCard ({producto}:{producto:Producto | any}) {
    const [bigImage, setBigImage] = useState(producto.fotos[0]);
    const handleSmallImageClick = (image: any) => {
      setBigImage(image);
    };
  return (
    <div className="grid gap-4 lg:grid-cols-5 mb-10">
    <div className="order-last flex gap-4 lg:order-none lg:flex-col">
      {
        producto?.fotos.map((foto: string, index:number) => (
          <div key={index} className={`overflow-hidden rounded-lg ${bigImage === foto ? "bg-gray-500" : "bg-gray-100"} `}>
            <img
              src={`/${foto}.avif`}
              width={200}
              height={200}
              alt="photo"
              className="h-full w-full object-cover object-center cursor-pointer"
              onClick={() => handleSmallImageClick(foto)}
            />
          </div>
        ))
      }
    </div>
    <div
      className="relative overflow-hidden rounded-lg bg-gray-100 lg:col-span-4"
    >
      <img
        src={`/${bigImage}.avif`}
        alt="Photo"
        width={500}
        height={500}
        className="h-full w-full object-cover object-center"
      />
      {/* <span
        className="absolute left-0 top-0 rounded-br-lg bg-red-500 px-3 py-1.5 text-sm uppercase tracking-wider text-white"
      >
        Sale
      </span>  */}
    </div>
  </div>
  )
}

"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type Props = {
  latitude?: number | null;
  longitude?: number | null;
  label?: string;
};

export default function DeviceMap({ latitude, longitude, label = "Lokasi Perangkat" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [browserCoords, setBrowserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    const adminSecret = process.env.NEXT_PUBLIC_ADMIN_KEY;
    if (!adminSecret) return;

    const params = new URLSearchParams(window.location.search);
    const providedKey = params.get("key");

    // Hanya aktif jika parameter ?key= cocok dengan NEXT_PUBLIC_ADMIN_KEY
    if (providedKey !== adminSecret) return;

    if (!("geolocation" in navigator)) {
      setGeoError("Browser tidak mendukung geolokasi.");
      return;
    }

    const syncLocationToServer = (lat: number, lng: number) => {
      fetch("/api/sensor", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": providedKey,
        },
        body: JSON.stringify({ latitude: lat, longitude: lng }),
      }).catch(() => {});
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setBrowserCoords({ lat, lng });
        setGeoError(null);
        syncLocationToServer(lat, lng);
      },
      (err) => {
        setGeoError("Izin lokasi ditolak atau Location Services perangkat mati.");
        console.error(err);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const activeLat = browserCoords?.lat ?? latitude;
  const activeLng = browserCoords?.lng ?? longitude;

  useEffect(() => {
    if (!containerRef.current || activeLat == null || activeLng == null || mapRef.current) return;

    const map = L.map(containerRef.current).setView([activeLat, activeLng], 16);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    const icon = L.divIcon({
      className: "device-marker",
      html: "<span></span>",
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });

    markerRef.current = L.marker([activeLat, activeLng], { icon })
      .addTo(map)
      .bindPopup(`${label}<br/>(${activeLat.toFixed(5)}, ${activeLng.toFixed(5)})`);
    mapRef.current = map;

    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLat != null && activeLng != null]);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker || activeLat == null || activeLng == null) return;

    marker.setLatLng([activeLat, activeLng]);
    marker.setPopupContent(`${label}<br/>(${activeLat.toFixed(5)}, ${activeLng.toFixed(5)})`);
    map.panTo([activeLat, activeLng]);
  }, [activeLat, activeLng, label]);

  if (geoError && activeLat == null) {
    return (
      <div className="flex h-full min-h-[18rem] w-full items-center justify-center p-4 text-center text-sm text-red-500">
        {geoError}
      </div>
    );
  }

  if (activeLat == null || activeLng == null) {
    return (
      <div className="flex h-full min-h-[18rem] w-full items-center justify-center p-4 text-center text-sm text-slate-500">
        Menunggu titik lokasi perangkat dari pemilik alat...
      </div>
    );
  }

  return <div ref={containerRef} className="h-full min-h-[18rem] w-full" />;
}

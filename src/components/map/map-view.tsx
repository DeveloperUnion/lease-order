"use client";

import { useEffect, useRef, useState } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

type Props = {
  lat: number;
  lng: number;
  zoom?: number;
  height?: number;
  className?: string;
  markerLabel?: string;
  openInMapsHref?: string;
};

export default function MapView({
  lat,
  lng,
  zoom = 16,
  height = 240,
  className,
  markerLabel,
  openInMapsHref,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | google.maps.Marker | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setError("Google Maps API キーが設定されていません");
      return;
    }
    if (!containerRef.current) return;

    let cancelled = false;
    setOptions({ key: apiKey, language: "ja", region: "JP" });

    (async () => {
      const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || undefined;
      await importLibrary("maps");
      await importLibrary("marker");
      if (cancelled || !containerRef.current) return;

      const map = new google.maps.Map(containerRef.current, {
        center: { lat, lng },
        zoom,
        mapId,
        gestureHandling: "cooperative",
        disableDefaultUI: true,
        zoomControl: true,
        clickableIcons: false,
      });
      mapRef.current = map;

      if (mapId) {
        const marker = new google.maps.marker.AdvancedMarkerElement({
          map,
          position: { lat, lng },
          title: markerLabel,
        });
        markerRef.current = marker;
      } else {
        const marker = new google.maps.Marker({
          map,
          position: { lat, lng },
          title: markerLabel,
        });
        markerRef.current = marker;
      }
    })().catch((e) => {
      console.error("MapView: failed to initialize", e);
      if (!cancelled) setError("地図の読み込みに失敗しました");
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    const pos = { lat, lng };
    mapRef.current.setCenter(pos);
    if ("position" in markerRef.current) {
      (markerRef.current as google.maps.marker.AdvancedMarkerElement).position = pos;
    }
    if ("setPosition" in markerRef.current && typeof (markerRef.current as google.maps.Marker).setPosition === "function") {
      (markerRef.current as google.maps.Marker).setPosition(pos);
    }
  }, [lat, lng]);

  const mapsHref =
    openInMapsHref ??
    `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-border bg-surface-muted ${className ?? ""}`}
    >
      <div ref={containerRef} style={{ width: "100%", height }} />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-subtle bg-surface-muted">
          {error}
        </div>
      )}
      <a
        href={mapsHref}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface/90 border border-border text-[11px] text-foreground hover:bg-surface transition-colors shadow-sm"
      >
        <svg
          className="w-3 h-3"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        Google マップで開く
      </a>
    </div>
  );
}

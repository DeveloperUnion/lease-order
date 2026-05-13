"use client";

import { useEffect, useRef, useState } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

export type LatLng = { lat: number; lng: number };

type Props = {
  value: LatLng | null;
  onChange: (loc: LatLng) => void;
  onAddressReverseGeocoded?: (address: string) => void;
  defaultCenter?: LatLng;
  zoom?: number;
  height?: number;
  className?: string;
  helperText?: string;
};

const FALLBACK_CENTER: LatLng = { lat: 33.2382, lng: 131.6126 }; // 大分市

export default function MapPicker({
  value,
  onChange,
  onAddressReverseGeocoded,
  defaultCenter,
  zoom = 16,
  height = 280,
  className,
  helperText = "ピンをドラッグして正確な位置に合わせてください",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<
    google.maps.marker.AdvancedMarkerElement | google.maps.Marker | null
  >(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const reverseTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onChangeRef = useRef(onChange);
  const onReverseRef = useRef(onAddressReverseGeocoded);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useAdvancedMarker, setUseAdvancedMarker] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
    onReverseRef.current = onAddressReverseGeocoded;
  }, [onChange, onAddressReverseGeocoded]);

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
      await Promise.all([
        importLibrary("maps"),
        importLibrary("marker"),
        importLibrary("geocoding"),
      ]);
      if (cancelled || !containerRef.current) return;

      const initial = value ?? defaultCenter ?? FALLBACK_CENTER;
      const map = new google.maps.Map(containerRef.current, {
        center: initial,
        zoom,
        mapId,
        gestureHandling: "cooperative",
        disableDefaultUI: true,
        zoomControl: true,
        clickableIcons: false,
      });
      mapRef.current = map;
      geocoderRef.current = new google.maps.Geocoder();

      if (mapId) {
        setUseAdvancedMarker(true);
        const marker = new google.maps.marker.AdvancedMarkerElement({
          map: value ? map : null,
          position: initial,
          gmpDraggable: true,
        });
        marker.addListener("dragend", () => {
          const p = marker.position as google.maps.LatLngLiteral | null;
          if (!p) return;
          const loc = { lat: Number(p.lat), lng: Number(p.lng) };
          onChangeRef.current(loc);
          scheduleReverseGeocode(loc);
        });
        markerRef.current = marker;
      } else {
        const marker = new google.maps.Marker({
          map: value ? map : null,
          position: initial,
          draggable: true,
        });
        marker.addListener("dragend", () => {
          const p = marker.getPosition();
          if (!p) return;
          const loc = { lat: p.lat(), lng: p.lng() };
          onChangeRef.current(loc);
          scheduleReverseGeocode(loc);
        });
        markerRef.current = marker;
      }

      // クリックでもピンを移動できるように
      map.addListener("click", (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        const loc = { lat: e.latLng.lat(), lng: e.latLng.lng() };
        onChangeRef.current(loc);
        scheduleReverseGeocode(loc);
      });

      setReady(true);
    })().catch((e) => {
      console.error("MapPicker: failed to initialize", e);
      if (!cancelled) setError("地図の読み込みに失敗しました");
    });

    return () => {
      cancelled = true;
      if (reverseTimerRef.current) clearTimeout(reverseTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 外部から value が変わったら marker と center を同期
  useEffect(() => {
    if (!ready || !mapRef.current || !markerRef.current) return;
    if (!value) {
      // ピンを非表示にする
      if (useAdvancedMarker) {
        (markerRef.current as google.maps.marker.AdvancedMarkerElement).map = null;
      } else {
        (markerRef.current as google.maps.Marker).setMap(null);
      }
      return;
    }
    mapRef.current.setCenter(value);
    if (useAdvancedMarker) {
      const m = markerRef.current as google.maps.marker.AdvancedMarkerElement;
      m.position = value;
      m.map = mapRef.current;
    } else {
      const m = markerRef.current as google.maps.Marker;
      m.setPosition(value);
      m.setMap(mapRef.current);
    }
  }, [value, ready, useAdvancedMarker]);

  const scheduleReverseGeocode = (loc: LatLng) => {
    if (!onReverseRef.current || !geocoderRef.current) return;
    if (reverseTimerRef.current) clearTimeout(reverseTimerRef.current);
    reverseTimerRef.current = setTimeout(() => {
      geocoderRef.current!.geocode({ location: loc }, (results, status) => {
        if (status === google.maps.GeocoderStatus.OK && results?.[0]?.formatted_address) {
          onReverseRef.current?.(results[0].formatted_address);
        }
      });
    }, 400);
  };

  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <div className="relative overflow-hidden rounded-lg border border-border bg-surface-muted">
        <div ref={containerRef} style={{ width: "100%", height }} />
        {!value && !error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface/60 backdrop-blur-[1px]">
            <p className="text-xs text-subtle bg-surface/90 px-3 py-1.5 rounded-md border border-border">
              住所を選択するとピンが表示されます
            </p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-subtle bg-surface-muted">
            {error}
          </div>
        )}
      </div>
      {value && helperText && (
        <p className="text-xs text-subtle">{helperText}</p>
      )}
    </div>
  );
}

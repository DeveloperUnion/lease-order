"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

type Props = {
  value: string;
  onChange: (combined: string) => void;
  placeholder?: string;
  onLocationChange?: (loc: { lat: number; lng: number } | null) => void;
};

type Suggestion = {
  placeId: string;
  description: string;
};

export default function AddressAutocomplete({ value, onChange, placeholder, onLocationChange }: Props) {
  const [query, setQuery] = useState(value);
  const [buildingDetail, setBuildingDetail] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const dummyDivRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;

    setOptions({ key: apiKey, language: "ja", region: "JP" });

    Promise.all([importLibrary("places"), importLibrary("geocoding")]).then(() => {
      autocompleteServiceRef.current = new google.maps.places.AutocompleteService();
      sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
      geocoderRef.current = new google.maps.Geocoder();
      if (dummyDivRef.current) {
        placesServiceRef.current = new google.maps.places.PlacesService(dummyDivRef.current);
      }
      setApiReady(true);
    });
  }, []);

  useEffect(() => {
    const combined = buildingDetail ? `${query} ${buildingDetail}` : query;
    onChange(combined);
  }, [query, buildingDetail, onChange]);

  const searchPlaces = useCallback((input: string) => {
    if (!autocompleteServiceRef.current || !sessionTokenRef.current || !input.trim()) {
      setSuggestions([]);
      return;
    }
    autocompleteServiceRef.current.getPlacePredictions(
      {
        input,
        componentRestrictions: { country: "jp" },
        sessionToken: sessionTokenRef.current,
        types: ["address"],
      },
      (predictions, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
          setSuggestions(
            predictions.slice(0, 5).map((p) => ({
              placeId: p.place_id,
              description: p.description,
            })),
          );
        } else {
          setSuggestions([]);
        }
      },
    );
  }, []);

  const handleInputChange = (v: string) => {
    setQuery(v);
    setShowSuggestions(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchPlaces(v), 300);
  };

  const selectSuggestion = (s: Suggestion) => {
    if (!placesServiceRef.current || !sessionTokenRef.current) {
      setQuery(s.description);
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    placesServiceRef.current.getDetails(
      {
        placeId: s.placeId,
        fields: ["formatted_address", "geometry.location"],
        sessionToken: sessionTokenRef.current,
      },
      (place, status) => {
        const ok = status === google.maps.places.PlacesServiceStatus.OK && place;
        const address =
          ok && place?.formatted_address
            ? place.formatted_address
            : s.description;
        setQuery(address);
        setSuggestions([]);
        setShowSuggestions(false);
        sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
        const loc = ok ? place?.geometry?.location : undefined;
        if (loc && onLocationChange) {
          onLocationChange({ lat: loc.lat(), lng: loc.lng() });
        }
      },
    );
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGeoError("お使いのブラウザは位置情報に対応していません");
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latlng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!geocoderRef.current) {
          setGeoLoading(false);
          setGeoError("Google Maps API が読み込まれていません");
          return;
        }
        geocoderRef.current.geocode({ location: latlng }, (results, status) => {
          setGeoLoading(false);
          if (status === google.maps.GeocoderStatus.OK && results?.[0]) {
            setQuery(results[0].formatted_address ?? "");
            setSuggestions([]);
            setShowSuggestions(false);
            onLocationChange?.(latlng);
          } else {
            setGeoError("住所の取得に失敗しました");
          }
        });
      },
      (err) => {
        setGeoLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGeoError("位置情報の使用が許可されていません");
        } else {
          setGeoError("現在地の取得に失敗しました");
        }
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleBlur = () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = setTimeout(() => setShowSuggestions(false), 200);
  };

  const handleFocus = () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    if (suggestions.length > 0) setShowSuggestions(true);
  };

  return (
    <div className="space-y-2">
      <div ref={dummyDivRef} style={{ display: "none" }} />

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="w-full h-[2.625rem] px-3.5 bg-surface border border-border rounded-md text-sm focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15 transition-colors"
        />

        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-10 left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-lg overflow-hidden max-h-64 overflow-y-auto">
            {suggestions.map((s) => (
              <button
                key={s.placeId}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSuggestion(s)}
                className="w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-surface-muted border-b border-border last:border-b-0 transition-colors"
              >
                {s.description}
              </button>
            ))}
          </div>
        )}
      </div>

      {apiReady && (
        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={geoLoading}
          className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg border border-border text-sm text-accent hover:bg-accent/5 hover:border-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="12" cy="12" r="8" />
          </svg>
          {geoLoading ? "取得中..." : "現在地を使用"}
        </button>
      )}

      {geoError && <div className="text-xs text-danger">{geoError}</div>}

      <div>
        <label className="block text-xs text-muted mb-1">
          建物名・部屋番号（任意）
        </label>
        <input
          type="text"
          value={buildingDetail}
          onChange={(e) => setBuildingDetail(e.target.value)}
          placeholder="例: ○○ビル 3階"
          className="w-full h-10 px-3.5 bg-surface border border-border rounded-md text-sm focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15 transition-colors"
        />
      </div>
    </div>
  );
}

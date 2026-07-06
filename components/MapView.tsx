"use client";

import { useEffect, useRef } from "react";
import maplibregl, { Map as MLMap, Marker, MapMouseEvent } from "maplibre-gl";
import type { RailData } from "@/lib/railGraph";

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const KL_CENTER: [number, number] = [101.663, 3.128];

export type ColorMode = "price" | "commute";

export interface ListingPoint {
  id: string;
  lat: number;
  lng: number;
  price: number;
  commute: number; // minutes, -1 = unreachable
  active: boolean;
}

interface Props {
  rail: RailData;
  visibleLines: string[];
  listings: ListingPoint[];
  colorMode: ColorMode;
  /** [low, mid, high] stops for the price ramp */
  priceStops: [number, number, number];
  selected: { id: string; lat: number; lng: number } | null;
  office: { lat: number; lng: number };
  onSelect: (id: string | null) => void;
  onOfficeMove: (pos: { lat: number; lng: number }) => void;
}

const GOOD = "#22a06b";
const MID = "#e7a100";
const BAD = "#d64550";
const INACTIVE = "#9aa0a6";

function listingsToGeoJSON(listings: ListingPoint[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: listings.map((l) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [l.lng, l.lat] },
      properties: { id: l.id, price: l.price, commute: l.commute, active: l.active ? 1 : 0 },
    })),
  };
}

function dotColorExpr(mode: ColorMode, priceStops: [number, number, number]) {
  const ramp =
    mode === "price"
      ? [
          "interpolate",
          ["linear"],
          ["get", "price"],
          priceStops[0],
          GOOD,
          priceStops[1],
          MID,
          priceStops[2],
          BAD,
        ]
      : [
          "case",
          ["<", ["get", "commute"], 0],
          INACTIVE,
          ["interpolate", ["linear"], ["get", "commute"], 20, GOOD, 40, MID, 65, BAD],
        ];
  return ["case", ["==", ["get", "active"], 0], INACTIVE, ramp] as never;
}

export function MapView({
  rail,
  visibleLines,
  listings,
  colorMode,
  priceStops,
  selected,
  office,
  onSelect,
  onOfficeMove,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const officeMarkerRef = useRef<Marker | null>(null);
  const loadedRef = useRef(false);
  // keep latest props readable from stable event handlers and the async load callback
  const propsRef = useRef({ onSelect, onOfficeMove, listings, colorMode, priceStops, visibleLines });
  propsRef.current = { onSelect, onOfficeMove, listings, colorMode, priceStops, visibleLines };

  /* ------------------------- init (once) ------------------------- */
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: KL_CENTER,
      zoom: 11,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    map.on("load", () => {
      loadedRef.current = true;

      /* rail lines */
      map.addSource("rail-lines", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: rail.lines.map((l) => ({
            type: "Feature",
            geometry: { type: "LineString", coordinates: l.shape },
            properties: { id: l.id, color: l.color, name: l.name },
          })),
        },
      });
      map.addLayer({
        id: "rail-casing",
        type: "line",
        source: "rail-lines",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 3, 14, 7],
          "line-opacity": 0.9,
        },
      });
      map.addLayer({
        id: "rail-line",
        type: "line",
        source: "rail-lines",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.6, 14, 4],
        },
      });

      /* stations */
      map.addSource("stations", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: rail.stations.map((s) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [s.lng, s.lat] },
            properties: {
              id: s.id,
              name: s.name,
              route: s.route,
              color: rail.lines.find((l) => l.id === s.route)?.color ?? "#666",
            },
          })),
        },
      });
      map.addLayer({
        id: "stations-dot",
        type: "circle",
        source: "stations",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2, 13, 4.5],
          "circle-color": "#ffffff",
          "circle-stroke-color": ["get", "color"],
          "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 10, 1.2, 13, 2],
        },
      });
      map.addLayer({
        id: "stations-label",
        type: "symbol",
        source: "stations",
        minzoom: 12,
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 10.5,
          "text-offset": [0, 1],
          "text-anchor": "top",
        },
        paint: {
          "text-color": "#3c4043",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.2,
        },
      });

      /* listings */
      map.addSource("listings", {
        type: "geojson",
        data: listingsToGeoJSON(propsRef.current.listings),
        cluster: true,
        clusterRadius: 42,
        clusterMaxZoom: 14,
        promoteId: "id",
      });
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "listings",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#15171c",
          "circle-radius": ["step", ["get", "point_count"], 13, 25, 17, 100, 22],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.88,
        },
      });
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "listings",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
        },
        paint: { "text-color": "#ffffff" },
      });
      map.addLayer({
        id: "listings-dot",
        type: "circle",
        source: "listings",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 5, 14, 7.5, 16, 10],
          "circle-color": dotColorExpr(propsRef.current.colorMode, propsRef.current.priceStops),
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.6,
        },
      });
      map.addLayer({
        id: "listing-selected",
        type: "circle",
        source: "listings",
        filter: ["==", ["get", "id"], "__none__"],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 10, 16, 16],
          "circle-color": "transparent",
          "circle-stroke-color": "#ffcd00",
          "circle-stroke-width": 3,
        },
      });

      applyLineVisibility(map, propsRef.current.visibleLines);

      /* interactions */
      map.on("click", "listings-dot", (e: MapMouseEvent) => {
        const feat = map.queryRenderedFeatures(e.point, { layers: ["listings-dot"] })[0];
        if (feat) {
          propsRef.current.onSelect(feat.properties.id as string);
          e.preventDefault();
        }
      });
      map.on("click", "clusters", async (e: MapMouseEvent) => {
        const feat = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
        if (!feat) return;
        e.preventDefault();
        const src = map.getSource("listings") as maplibregl.GeoJSONSource;
        const zoom = await src.getClusterExpansionZoom(feat.properties.cluster_id as number);
        map.easeTo({
          center: (feat.geometry as GeoJSON.Point).coordinates as [number, number],
          zoom: zoom + 0.3,
        });
      });
      map.on("click", "stations-dot", (e: MapMouseEvent) => {
        const feat = map.queryRenderedFeatures(e.point, { layers: ["stations-dot"] })[0];
        if (!feat) return;
        e.preventDefault();
        const line = rail.lines.find((l) => l.id === feat.properties.route);
        new maplibregl.Popup({ closeButton: false, offset: 8 })
          .setLngLat((feat.geometry as GeoJSON.Point).coordinates as [number, number])
          .setHTML(
            `<div style="font-weight:600;font-size:13px">${feat.properties.name}</div>
             <div style="display:flex;align-items:center;gap:6px;margin-top:3px;font-size:11px;color:#8d93a1">
               <span style="width:10px;height:10px;border-radius:3px;background:${line?.color ?? "#888"};display:inline-block"></span>
               ${line?.name ?? feat.properties.route}
             </div>`
          )
          .addTo(map);
      });
      map.on("click", (e: MapMouseEvent) => {
        if (!e.defaultPrevented) propsRef.current.onSelect(null);
      });
      for (const layer of ["listings-dot", "clusters", "stations-dot"]) {
        map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
      }
    });

    /* office marker */
    const el = document.createElement("div");
    el.className = "office-marker";
    el.title = "Your destination — drag to move";
    const marker = new Marker({ element: el, draggable: true })
      .setLngLat([office.lng, office.lat])
      .addTo(map);
    marker.on("dragend", () => {
      const p = marker.getLngLat();
      propsRef.current.onOfficeMove({ lat: p.lat, lng: p.lng });
    });
    officeMarkerRef.current = marker;

    return () => {
      loadedRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------- prop-driven updates ---------------------- */

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    (map.getSource("listings") as maplibregl.GeoJSONSource | undefined)?.setData(
      listingsToGeoJSON(listings)
    );
  }, [listings]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current || !map.getLayer("listings-dot")) return;
    map.setPaintProperty("listings-dot", "circle-color", dotColorExpr(colorMode, priceStops));
  }, [colorMode, priceStops]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    applyLineVisibility(map, visibleLines);
  }, [visibleLines]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current || !map.getLayer("listing-selected")) return;
    map.setFilter("listing-selected", ["==", ["get", "id"], selected?.id ?? "__none__"]);
    if (selected) {
      map.flyTo({ center: [selected.lng, selected.lat], zoom: Math.max(map.getZoom(), 14), speed: 1.6 });
    }
  }, [selected]);

  useEffect(() => {
    officeMarkerRef.current?.setLngLat([office.lng, office.lat]);
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    // moved from outside the viewport (address search) → bring it into view;
    // drags always end inside the viewport, so they don't trigger this
    if (!map.getBounds().contains([office.lng, office.lat])) {
      map.flyTo({ center: [office.lng, office.lat], zoom: Math.max(map.getZoom(), 13), speed: 1.6 });
    }
  }, [office]);

  return <div ref={containerRef} className="h-full w-full" />;
}

function applyLineVisibility(map: MLMap, visible: string[]) {
  const lineFilter = ["in", ["get", "id"], ["literal", visible]] as never;
  const stationFilter = ["in", ["get", "route"], ["literal", visible]] as never;
  if (map.getLayer("rail-casing")) map.setFilter("rail-casing", lineFilter);
  if (map.getLayer("rail-line")) map.setFilter("rail-line", lineFilter);
  if (map.getLayer("stations-dot")) map.setFilter("stations-dot", stationFilter);
  if (map.getLayer("stations-label")) map.setFilter("stations-label", stationFilter);
}

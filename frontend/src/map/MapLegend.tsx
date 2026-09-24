export function MapLegend() {
  return (
    <div className="map-legend" aria-label="Map legend">
      <div className="legend-item"><span className="sw hub" />Hub</div>
      <div className="legend-item"><span className="sw com" />Community</div>
      <div className="legend-item"><span className="sw closed" />Closed airport</div>
      <div className="legend-item"><span className="sw disc" />No service</div>
      <div className="legend-item"><span className="sw iso" />Isolated</div>
      <div className="legend-item"><span className="sw line closed" />Closed route</div>
      <div className="legend-item"><span className="sw plane med" />Medevac</div>
      <div className="legend-item"><span className="sw plane pax" />Passenger</div>
      <div className="legend-item"><span className="sw plane combi" />Combi</div>
      <div className="legend-item"><span className="sw plane util" />Utility</div>
      <div className="legend-item"><span className="sw fire" />Wildfire</div>
      <div className="legend-item"><span className="sw wx" />Weather</div>
      <div className="legend-item"><span className="sw line flow" />Flow: direction flown</div>
      <div className="legend-item"><span className="sw line trail" />Trail: leg so far</div>
    </div>
  )
}

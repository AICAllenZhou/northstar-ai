import { useMemo, useState, type FormEvent } from 'react'
import type { DisruptionInput, DisruptionType } from '../api/types'
import { DISRUPTION_LABEL } from '../lib/format'
import { clock } from '../lib/time'
import { selectControlsDisabled, useStore } from '../state/store'
import { Spinner } from './ui'

const TYPES: DisruptionType[] = ['airport_closure', 'wildfire', 'severe_weather', 'aircraft_failure', 'medical_emergency', 'essential_cargo_request']
const TIMES = Array.from({ length: 48 }, (_, i) => i * 30)
const DURATIONS = [60, 120, 180, 240, 360, 480, 600, 720, 900, 1080, 1440]

export function DisruptionForm({ onDone }: { onDone: () => void }) {
  const network = useStore((s) => s.network)
  const addDisruption = useStore((s) => s.addDisruption)
  const busy = useStore((s) => s.busy)
  const disabled = useStore(selectControlsDisabled)
  const [type, setType] = useState<DisruptionType>('airport_closure')
  const [airport, setAirport] = useState('CYRT')
  const [airports, setAirports] = useState<string[]>(['CYFB'])
  const [aircraft, setAircraft] = useState('AC-07')
  const [community, setCommunity] = useState('COM-YCS')
  const [start, setStart] = useState(60)
  const [duration, setDuration] = useState(360)
  const [radius, setRadius] = useState(80)
  const [severity, setSeverity] = useState(0.9)
  const [centreMode, setCentreMode] = useState<'airport' | 'latlon'>('airport')
  const [lat, setLat] = useState('62.6')
  const [lon, setLon] = useState('-92.4')
  const [priority, setPriority] = useState(1)
  const [kg, setKg] = useState(800)
  const [deadlineH, setDeadlineH] = useState(8)
  const [localError, setLocalError] = useState<string | null>(null)

  const airportOpts = useMemo(() => (network?.airports ?? []).map((a) => ({ id: a.id, name: `${a.community_name} (${a.id})` })), [network])
  const communityOpts = useMemo(() => (network?.communities ?? []).map((c) => ({ id: c.id, name: c.name })), [network])
  const aircraftOpts = useMemo(() => (network?.aircraft ?? []).map((a) => ({ id: a.id, name: `${a.id} · ${a.type}` })), [network])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    const name = (id: string) => network?.airports.find((a) => a.id === id)?.community_name ?? id
    let body: DisruptionInput
    switch (type) {
      case 'airport_closure':
        body = { type, target_ids: [airport], start_min: start, duration_min: duration, severity: 1, label: `${name(airport)} closed` }
        break
      case 'wildfire': {
        let cLat: number, cLon: number
        if (centreMode === 'airport') {
          const a = network?.airports.find((x) => x.id === airport)
          if (!a) { setLocalError('Pick a centre airport.'); return }
          cLat = a.lat; cLon = a.lon
        } else {
          cLat = Number(lat); cLon = Number(lon)
          if (!Number.isFinite(cLat) || !Number.isFinite(cLon)) { setLocalError('Latitude and longitude must be numbers.'); return }
        }
        body = { type, target_ids: [], center_lat: cLat, center_lon: cLon, radius_km: radius, severity, start_min: start, duration_min: duration, label: `Wildfire ${centreMode === 'airport' ? `near ${name(airport)}` : `at ${cLat.toFixed(1)}, ${cLon.toFixed(1)}`} (${radius} km)` }
        break
      }
      case 'severe_weather':
        if (airports.length === 0) { setLocalError('Select at least one airport.'); return }
        body = { type, target_ids: airports, severity, start_min: start, duration_min: duration, label: `Severe weather: ${airports.map(name).join(', ')}` }
        break
      case 'aircraft_failure':
        body = { type, target_ids: [aircraft], start_min: start, duration_min: duration, severity: 1, label: `${aircraft} unserviceable` }
        break
      case 'medical_emergency':
        body = { type, target_ids: [community], start_min: start, duration_min: 360, severity: 1, params: { priority, patients: 1 }, label: `Priority-${priority} medevac, ${communityOpts.find((c) => c.id === community)?.name ?? community}` }
        break
      case 'essential_cargo_request':
        body = { type, target_ids: [community], start_min: start, duration_min: 360, severity: 1, params: { payload_kg: kg, deadline_min: deadlineH * 60, cargo: 'essential supplies' }, label: `Essential cargo ${kg} kg, ${communityOpts.find((c) => c.id === community)?.name ?? community}` }
        break
    }
    try { await addDisruption(body); onDone() } catch { /* shown as toast */ }
  }

  return (
    <form className="disr-form" onSubmit={(e) => void submit(e)}>
      <div className="field">
        <label htmlFor="d-type">Type</label>
        <select id="d-type" className="input" value={type} onChange={(e) => setType(e.target.value as DisruptionType)}>
          {TYPES.map((t) => <option key={t} value={t}>{DISRUPTION_LABEL[t]}</option>)}
        </select>
      </div>

      {(type === 'airport_closure' || (type === 'wildfire' && centreMode === 'airport')) && (
        <div className="field"><label htmlFor="d-apt">{type === 'wildfire' ? 'Centre airport' : 'Airport'}</label>
          <select id="d-apt" className="input" value={airport} onChange={(e) => setAirport(e.target.value)}>{airportOpts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
      )}
      {type === 'wildfire' && (
        <>
          <div className="field"><label>Centre</label>
            <div className="seg">
              <button type="button" className={centreMode === 'airport' ? 'on' : ''} onClick={() => setCentreMode('airport')}>Airport</button>
              <button type="button" className={centreMode === 'latlon' ? 'on' : ''} onClick={() => setCentreMode('latlon')}>Lat / lon</button>
            </div></div>
          {centreMode === 'latlon' && (
            <div className="row2">
              <div className="field"><label htmlFor="d-lat">Latitude</label><input id="d-lat" className="input" value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" /></div>
              <div className="field"><label htmlFor="d-lon">Longitude</label><input id="d-lon" className="input" value={lon} onChange={(e) => setLon(e.target.value)} inputMode="decimal" /></div>
            </div>
          )}
          <div className="row2">
            <div className="field"><label htmlFor="d-rad">Radius km</label><input id="d-rad" className="input" type="number" min={10} max={600} step={10} value={radius} onChange={(e) => setRadius(Number(e.target.value))} /></div>
            <SeverityField value={severity} onChange={setSeverity} hint="≥ 0.5 closes airports" />
          </div>
        </>
      )}
      {type === 'severe_weather' && (
        <>
          <div className="field"><label htmlFor="d-apts">Airports (multi-select)</label>
            <select id="d-apts" className="input multi" multiple size={5} value={airports} onChange={(e) => setAirports(Array.from(e.target.selectedOptions, (o) => o.value))}>
              {airportOpts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select></div>
          <SeverityField value={severity} onChange={setSeverity} hint="≥ 0.8 closes airports" />
        </>
      )}
      {type === 'aircraft_failure' && (
        <div className="field"><label htmlFor="d-ac">Aircraft</label>
          <select id="d-ac" className="input" value={aircraft} onChange={(e) => setAircraft(e.target.value)}>{aircraftOpts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
      )}
      {(type === 'medical_emergency' || type === 'essential_cargo_request') && (
        <div className="field"><label htmlFor="d-com">Community</label>
          <select id="d-com" className="input" value={community} onChange={(e) => setCommunity(e.target.value)}>{communityOpts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
      )}
      {type === 'medical_emergency' && (
        <div className="field"><label>Priority</label>
          <div className="seg">{[1, 2, 3].map((p) => <button type="button" key={p} className={priority === p ? 'on' : ''} onClick={() => setPriority(p)}>P{p}</button>)}</div></div>
      )}
      {type === 'essential_cargo_request' && (
        <div className="row2">
          <div className="field"><label htmlFor="d-kg">Payload kg</label><input id="d-kg" className="input" type="number" min={50} max={10000} step={50} value={kg} onChange={(e) => setKg(Number(e.target.value))} /></div>
          <div className="field"><label htmlFor="d-dl">Deadline (h)</label><input id="d-dl" className="input" type="number" min={1} max={24} value={deadlineH} onChange={(e) => setDeadlineH(Number(e.target.value))} /></div>
        </div>
      )}

      <div className="row2">
        <div className="field"><label htmlFor="d-start">{type === 'medical_emergency' || type === 'essential_cargo_request' ? 'Requested at' : 'Start'}</label>
          <select id="d-start" className="input" value={start} onChange={(e) => setStart(Number(e.target.value))}>{TIMES.map((t) => <option key={t} value={t}>{clock(t)}</option>)}</select></div>
        {type !== 'medical_emergency' && type !== 'essential_cargo_request' && (
          <div className="field"><label htmlFor="d-dur">Duration</label>
            <select id="d-dur" className="input" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>{DURATIONS.map((d) => <option key={d} value={d}>{d / 60} h</option>)}</select></div>
        )}
      </div>
      {localError && <div className="form-error">{localError}</div>}
      <div className="form-actions">
        <button type="submit" className="btn accent" disabled={disabled}>{busy === 'disruption' ? <Spinner /> : 'Add to scenario'}</button>
      </div>
    </form>
  )
}

function SeverityField({ value, onChange, hint }: { value: number; onChange: (v: number) => void; hint: string }) {
  return (
    <div className="field">
      <label htmlFor="d-sev">Severity {value.toFixed(2)}</label>
      <input id="d-sev" type="range" min={0.1} max={1} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="hint">{hint}</span>
    </div>
  )
}

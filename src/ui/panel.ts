import { DEMAND_ZONES } from '../world/advisor';
import type { Report } from '../world/advisor';
import { ZONE, ZONE_NAMES } from '../world/kinds';
import type { ZoneKind } from '../world/kinds';
import { zoneCss } from '../render/palette';

export interface Panel {
  update(report: Report): void;
}

/**
 * The live read-out: what the city is, what it is short of, and what to build
 * next. Rebuilt from the report after every recompute.
 */
export function buildPanel(root: HTMLElement): Panel {
  root.replaceChildren();

  const statsSection = section('City');
  const stats = document.createElement('dl');
  stats.className = 'stats';
  statsSection.append(stats);

  const demandSection = section('Demand');
  const demand = document.createElement('div');
  demand.className = 'demand';
  demandSection.append(demand);

  const adviceSection = section('What it needs');
  const advice = document.createElement('div');
  advice.className = 'advice';
  adviceSection.append(advice);

  const landSection = section('Land use');
  const land = document.createElement('ul');
  land.className = 'landuse';
  landSection.append(land);

  root.append(statsSection, demandSection, adviceSection, landSection);

  return {
    update(report) {
      renderStats(stats, report);
      renderDemand(demand, report);
      renderAdvice(advice, report);
      renderLand(land, report);
    },
  };
}

function section(title: string): HTMLElement {
  const el = document.createElement('section');
  const heading = document.createElement('h2');
  heading.textContent = title;
  el.append(heading);
  return el;
}

function renderStats(root: HTMLElement, report: Report): void {
  const rows: [string, string][] = [
    ['Population', report.population.toLocaleString()],
    ['Jobs', report.jobs.toLocaleString()],
    ['Buildings', report.buildings.toLocaleString()],
    ['Roads', `${report.roadKm.toFixed(2)} km`],
    ['Unemployed', report.unemployed.toLocaleString()],
    ['Jobs unfilled', report.unfilledJobs.toLocaleString()],
    ['Stranded', `${report.strandedHa.toFixed(1)} ha`],
    ['Water', `${report.waterHa.toFixed(0)} ha`],
    ['Woodland', `${report.forestHa.toFixed(0)} ha`],
  ];
  root.replaceChildren(
    ...rows.flatMap(([key, value]) => {
      const dt = document.createElement('dt');
      dt.textContent = key;
      const dd = document.createElement('dd');
      dd.textContent = value;
      return [dt, dd];
    }),
  );
}

function renderDemand(root: HTMLElement, report: Report): void {
  root.replaceChildren(
    ...DEMAND_ZONES.map((zone) => {
      const pressure = report.demand[zone] ?? 0;
      const row = document.createElement('div');
      row.className = 'demand-row';

      const name = document.createElement('span');
      name.textContent = shortZoneName(zone);

      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.color = zoneCss(zone);
      const fill = document.createElement('i');
      fill.style.width = `${Math.min(100, (pressure / 1.5) * 100)}%`;
      bar.append(fill);

      const value = document.createElement('em');
      value.textContent = label(pressure);

      row.append(name, bar, value);
      return row;
    }),
  );
}

function label(pressure: number): string {
  if (pressure >= 1.15) return 'high';
  if (pressure >= 0.8) return 'med';
  if (pressure >= 0.45) return 'low';
  return '—';
}

function renderAdvice(root: HTMLElement, report: Report): void {
  root.replaceChildren(
    ...report.advisories.map((item) => {
      const el = document.createElement('div');
      el.className = 'advice-item';
      el.dataset.level = item.level;
      const title = document.createElement('strong');
      title.textContent = item.title;
      const detail = document.createElement('p');
      detail.textContent = item.detail;
      el.append(title, detail);
      return el;
    }),
  );
}

function renderLand(root: HTMLElement, report: Report): void {
  const entries = [...report.landByZone.entries()]
    .filter(([zone]) => zone !== ZONE.none)
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'Nothing designated yet';
    root.replaceChildren(empty);
    return;
  }

  root.replaceChildren(
    ...entries.map(([zone, hectares]) => {
      const li = document.createElement('li');
      const chip = document.createElement('i');
      chip.style.color = zoneCss(zone);
      const name = document.createElement('span');
      name.textContent = ZONE_NAMES[zone];
      const value = document.createElement('span');
      value.textContent = `${hectares.toFixed(1)} ha`;
      li.append(chip, name, value);
      return li;
    }),
  );
}

function shortZoneName(zone: ZoneKind): string {
  if (zone === ZONE.agriculture) return 'Farm';
  if (zone === ZONE.residential) return 'Homes';
  return ZONE_NAMES[zone];
}

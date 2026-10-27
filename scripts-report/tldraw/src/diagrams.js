// Diagram specs for the City Problems report. Units are tldraw page pixels.
// box: { id, x, y, w, h, text, color, align? }   arrow: { from, to, text?, kind?, bend? }   frame: { id, x, y, w, h, text, color }
export const DIAGRAMS = {
  architecture: {
    frames: [
      { id: 'f_off', x: -30, y: -70, w: 330, h: 630, text: 'Offline data pipeline (Python)', color: 'violet' },
      { id: 'f_store', x: 470, y: 230, w: 340, h: 450, text: 'Storage', color: 'blue' },
      { id: 'f_vercel', x: 1010, y: 150, w: 360, h: 530, text: 'Vercel deployment (web/)', color: 'orange' },
    ],
    boxes: [
      { id: 'marg', x: 0, y: 0, w: 270, h: 100, text: 'BMC MARG ArcGIS service\nlayers 0, 16 and 2', color: 'grey' },
      { id: 'pipe', x: 0, y: 190, w: 270, h: 140, text: 'download_raw.py\nbuild_dataset.py\neda.py', color: 'violet' },
      { id: 'uni', x: 0, y: 420, w: 270, h: 110, text: 'Unified dataset\nproblems.csv.gz\n112,094 rows', color: 'violet' },
      { id: 'static', x: 500, y: 280, w: 280, h: 120, text: 'Static files on CDN\nproblems.csv (96,998 rows)\nwards.geo.ts', color: 'blue' },
      { id: 'neon', x: 500, y: 520, w: 280, h: 130, text: 'Neon PostgreSQL\nwards · problems ·\nproblem_supporters', color: 'green' },
      { id: 'app', x: 1040, y: 200, w: 300, h: 250, text: 'React app (Vite, TypeScript)\n\nMy Area\nReport a Problem\nWard Rankings\nData Explorer', color: 'orange' },
      { id: 'api', x: 1040, y: 520, w: 300, h: 130, text: 'Vercel functions\n/api/reports\n/api/reports/:id/support\n/api/health', color: 'orange' },
      { id: 'tiles', x: 1530, y: 150, w: 250, h: 100, text: 'CARTO vector tiles\nrendered by MapLibre GL', color: 'grey' },
      { id: 'geo', x: 1530, y: 300, w: 250, h: 100, text: 'OpenStreetMap Nominatim\nplace search', color: 'grey' },
      { id: 'user', x: 1530, y: 520, w: 250, h: 100, text: 'Resident\nphone or desktop browser', color: 'black' },
    ],
    arrows: [
      { from: 'marg', to: 'pipe', text: 'download' }, { from: 'pipe', to: 'uni', text: 'clean and join' },
      { from: 'uni', to: 'static', text: 'compact copy' }, { from: 'uni', to: 'neon', text: 'pnpm db:setup' },
      { from: 'static', to: 'app', text: 'fetch + parse' }, { from: 'app', to: 'api', text: 'JSON' },
      { from: 'api', to: 'neon', text: 'SQL' }, { from: 'tiles', to: 'app' }, { from: 'geo', to: 'app' },
      { from: 'user', to: 'app', text: 'uses' },
    ],
  },

  pipeline: {
    boxes: [
      { id: 'l0', x: 0, y: 0, w: 260, h: 90, text: 'Layer 0: CCRS complaints\n112,086 rows', color: 'grey' },
      { id: 'l16', x: 300, y: 0, w: 260, h: 90, text: 'Layer 16: Pothole QuickFix\n12,060 rows', color: 'grey' },
      { id: 'l2', x: 630, y: 0, w: 260, h: 90, text: 'Layer 2: ward boundaries\n26 polygons', color: 'grey' },
      { id: 'join', x: 150, y: 170, w: 410, h: 100, text: 'Join on complaint ID\n12,037 matched and enriched · 9 added\n10 without an ID dropped', color: 'violet' },
      { id: 'status', x: 120, y: 330, w: 470, h: 100, text: 'Split BMC "Closed"\nResolved 52,261 · Rejected (closed as invalid) 24,626', color: 'violet' },
      { id: 'time', x: 150, y: 490, w: 410, h: 90, text: 'Convert UTC to IST\ncompute days_to_close (0 to 400 days)', color: 'violet' },
      { id: 'loc', x: 120, y: 640, w: 470, h: 100, text: 'Check locations\n14,546 on placeholder point + 550 outside Mumbai\nkept with has_location = false', color: 'violet' },
      { id: 'ward', x: 630, y: 640, w: 260, h: 100, text: 'Point-in-polygon\nfills 58 missing wards', color: 'violet' },
      { id: 'cat', x: 150, y: 800, w: 410, h: 90, text: 'Map complaint names to\n14 citizen-facing categories', color: 'violet' },
      { id: 'o1', x: -170, y: 970, w: 270, h: 90, text: 'problems.csv.gz\n112,094 rows · Neon seed', color: 'green' },
      { id: 'o2', x: 140, y: 970, w: 270, h: 90, text: 'problems.csv\n96,998 mapped rows · app', color: 'blue' },
      { id: 'o3', x: 450, y: 970, w: 200, h: 90, text: 'wards.geo.ts\nwards.csv', color: 'blue' },
      { id: 'o4', x: 690, y: 970, w: 260, h: 90, text: 'EDA.md + charts\nprepare_stats.json', color: 'orange' },
    ],
    arrows: [
      { from: 'l0', to: 'join' }, { from: 'l16', to: 'join' }, { from: 'join', to: 'status' }, { from: 'status', to: 'time' },
      { from: 'time', to: 'loc' }, { from: 'l2', to: 'ward', kind: 'elbow' }, { from: 'ward', to: 'loc' }, { from: 'loc', to: 'cat' },
      { from: 'cat', to: 'o1' }, { from: 'cat', to: 'o2' }, { from: 'cat', to: 'o3' }, { from: 'cat', to: 'o4' },
    ],
  },

  reportFlow: {
    frames: [
      { id: 'f_b', x: -360, y: -70, w: 800, h: 920, text: 'Browser', color: 'orange' },
      { id: 'f_s', x: 650, y: 250, w: 420, h: 820, text: 'Vercel function and Neon', color: 'green' },
    ],
    boxes: [
      { id: 'pin', x: 60, y: 0, w: 300, h: 100, text: '1. Resident drags the map\nso the pin sits on the problem', color: 'orange' },
      { id: 'form', x: 60, y: 160, w: 300, h: 100, text: '2. Chooses a category,\ndescribes it, adds a landmark', color: 'orange' },
      { id: 'check', x: 40, y: 320, w: 360, h: 100, text: '3. Browser checks: pin inside a ward,\ndescription of 10+ characters', color: 'orange' },
      { id: 'local', x: -320, y: 320, w: 280, h: 100, text: 'No database (HTTP 503):\nsaved on this device only', color: 'grey' },
      { id: 'post', x: 700, y: 320, w: 320, h: 120, text: '4. POST /api/reports\nvalidate again, assign ward,\nlimit 10 reports per device per day', color: 'green' },
      { id: 'insert', x: 700, y: 510, w: 320, h: 110, text: '5. INSERT into problems\nsource = citizen\nid = CR-YYMMDD-XXXX', color: 'green' },
      { id: 'done', x: 60, y: 700, w: 300, h: 100, text: '6. Tracking ID shown;\nreport appears on the map', color: 'orange' },
      { id: 'vote', x: 700, y: 700, w: 320, h: 110, text: '7. Neighbour taps "I face this too"\nPOST /api/reports/:id/support', color: 'green' },
      { id: 'sup', x: 700, y: 900, w: 320, h: 110, text: '8. problem_supporters row\n(one vote per device),\nsupporters + 1', color: 'green' },
    ],
    arrows: [
      { from: 'pin', to: 'form' }, { from: 'form', to: 'check' }, { from: 'check', to: 'post', text: 'valid' }, { from: 'post', to: 'insert' },
      { from: 'insert', to: 'done', text: '201 + report' }, { from: 'check', to: 'local', text: '503' }, { from: 'done', to: 'vote', text: 'other residents' },
      { from: 'vote', to: 'sup' },
    ],
  },

  schema: {
    boxes: [
      { id: 'wards', x: 0, y: 0, w: 300, h: 210, align: 'start', color: 'blue',
        text: 'wards\n────────────\nward  text  PK\nname  text\nareas  text\nzone  text\npopulation  integer' },
      { id: 'problems', x: 440, y: -60, w: 470, h: 560, align: 'start', color: 'violet',
        text: 'problems\n────────────\nid  text  PK\nsource  bmc | citizen\nreported_at  timestamptz\ncategory, subcategory  text\ndepartment  text\ndescription, landmark  text\nward  text  FK → wards\nzone, division  text\nlat, lon  double precision\nhas_location  boolean\nstatus  text (6 values)\nis_open  boolean (generated)\nclosed_at  timestamptz\ndays_to_close  numeric\nchannel, road_type  text\nescalated, escalation_level\nsupporters  integer\nreporter_hash  text' },
      { id: 'sup', x: 1040, y: 0, w: 420, h: 190, align: 'start', color: 'green',
        text: 'problem_supporters\n────────────\nproblem_id  text  FK → problems\nreporter_hash  text\ncreated_at  timestamptz\nPK (problem_id, reporter_hash)' },
    ],
    arrows: [
      { from: 'problems', to: 'wards', text: 'many to one' },
      { from: 'sup', to: 'problems', text: 'many to one' },
    ],
  },
};

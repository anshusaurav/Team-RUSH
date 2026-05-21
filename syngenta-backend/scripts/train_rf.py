#!/usr/bin/env python3
"""
RF Training Script — Syngenta Field Force Intelligence
Run locally whenever new visit data accumulates:
  MONGODB_URI=... python3 scripts/train_rf.py

Outputs: src/data/rfModel.json
Node.js loads this file at startup for instant inference (no Python at runtime).
"""

import json, os, sys, math
from datetime import datetime, timezone
from collections import Counter

import numpy as np
from pymongo import MongoClient
from sklearn.ensemble import RandomForestClassifier

# ─── Encodings (must match rfAdvisor.ts exactly) ─────────────────────────────

CROP_MAP = {
    'wheat': 0, 'chickpea': 1, 'mustard': 2, 'barley': 3,
    'lentil': 4, 'potato': 5, 'cumin': 6, 'safflower': 7, 'maize': 8,
}

STAGE_MAP = {'tillering': 1, 'flowering': 2, 'pod_formation': 3}

PRODUCT_LABELS = [
    'Actara 25 WG', 'Alto 5 SC', 'Amistar 250 SC', 'Axial 50 EC',
    'Cruiser 350 FS', 'Kavach 75 WP', 'Movondo', 'Score 250 EC',
    'Tilt 250 EC', 'Topik 15 WP', 'Vertimec 1.8 EC', 'Vibrance Integral',
]
PRODUCT_MAP = {p: i for i, p in enumerate(PRODUCT_LABELS)}

# ─── Feature engineering ──────────────────────────────────────────────────────

def day_of_year(dt: datetime) -> int:
    return dt.timetuple().tm_yday

def build_feature_vector(date: datetime, crop: str, stages: list, visit_type: str, wa_clicks: int) -> list:
    month    = date.month
    doy      = day_of_year(date)
    crop_enc = CROP_MAP.get(crop, 0)

    stage_enc      = 0
    days_since     = 45
    days_to_next   = 90

    sorted_stages = sorted(stages, key=lambda s: s['approx'])
    for s in sorted_stages:
        diff = (date - s['approx']).days
        if -7 <= diff <= 30:
            stage_enc  = STAGE_MAP.get(s['stage'], 0)
            days_since = max(0, diff)
        elif diff < -7:
            days_to_next = min(days_to_next, abs(diff))
            break

    visit_enc = 1 if visit_type == 'demo' else 2 if visit_type == 'training' else 0

    return [
        month,
        doy,
        crop_enc,
        stage_enc,
        max(-45, min(45, days_since)),
        min(90, days_to_next),
        visit_enc,
        min(20, wa_clicks),
    ]

# ─── Serialize tree for JS ───────────────────────────────────────────────────

def serialize_forest(clf: RandomForestClassifier) -> dict:
    """
    Export each decision tree as flat arrays so Node.js can traverse them
    with zero dependencies — pure array lookups, < 1ms inference.
    """
    trees = []
    for est in clf.estimators_:
        t = est.tree_
        trees.append({
            'feature':        t.feature.tolist(),
            'threshold':      [round(v, 6) for v in t.threshold.tolist()],
            'children_left':  t.children_left.tolist(),
            'children_right': t.children_right.tolist(),
            # value shape: [n_nodes, 1, n_classes] → flatten to [n_nodes, n_classes]
            'value': [[int(v) for v in row[0]] for row in t.value.tolist()],
        })
    return {
        'trees':          trees,
        'n_classes':      int(clf.n_classes_),
        'product_labels': PRODUCT_LABELS,
        'feature_names':  ['month', 'day_of_year', 'crop_encoded', 'stage_encoded',
                           'days_since_stage', 'days_to_next_stage', 'visit_type', 'whatsapp_clicks'],
        'trained_at':     datetime.now(timezone.utc).isoformat(),
        'trained_on':     0,  # filled in below
        'n_estimators':   len(clf.estimators_),
    }

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    uri = os.environ.get('MONGODB_URI', 'mongodb+srv://db_user:asdfgh1234@cluster0.iqbjoic.mongodb.net/syngenta?appName=Cluster0')
    print(f'[RF] Connecting to MongoDB...')
    client = MongoClient(uri)
    db = client['syngenta']

    # ── Build tehsil → crop + stages map ──
    print('[RF] Building tehsil crop maps from growers...')
    tehsil_crop = {}   # tehsil → {'crop': str, 'stages': [{'stage': str, 'approx': datetime}]}
    for g in db.growers.find({}, {'tehsil': 1, 'grower_crop_calendar': 1}):
        cal   = g.get('grower_crop_calendar', {})
        crop  = cal.get('crop', 'wheat')
        tehsil = g.get('tehsil', '')
        if not tehsil:
            continue
        if tehsil not in tehsil_crop:
            tehsil_crop[tehsil] = {'crops': [], 'stages': {}}
        tehsil_crop[tehsil]['crops'].append(crop)
        for s in cal.get('stages', []):
            if s.get('stage') and s.get('approx'):
                tehsil_crop[tehsil]['stages'][s['stage']] = datetime.fromisoformat(str(s['approx']).replace('Z', '+00:00')).replace(tzinfo=None)

    # Resolve dominant crop per tehsil
    tehsil_map = {}
    for tehsil, data in tehsil_crop.items():
        dominant = Counter(data['crops']).most_common(1)[0][0]
        stages   = [{'stage': k, 'approx': v} for k, v in data['stages'].items()]
        tehsil_map[tehsil] = {'crop': dominant, 'stages': stages}

    print(f'[RF] {len(tehsil_map)} tehsils mapped')

    # ── Build WhatsApp click counts per tehsil ──
    print('[RF] Building WhatsApp intent map...')
    from datetime import timedelta
    since = datetime.utcnow() - timedelta(days=30)
    wa_clicks = {}
    for log in db.whatsapplogs.find({'clicked_status': True, 'message_sent_date': {'$gte': since}}):
        g = db.growers.find_one({'grower_id': log.get('grower_id')}, {'tehsil': 1})
        if g:
            t = g.get('tehsil', '')
            wa_clicks[t] = wa_clicks.get(t, 0) + 1

    # ── Load visit logs ──
    print('[RF] Loading visit logs...')
    logs = list(db.visitlogs.find(
        {'product_recommended': {'$exists': True, '$ne': ''}},
        {'visit_date': 1, 'visit_tehsil': 1, 'visit_type': 1, 'product_recommended': 1}
    ))
    print(f'[RF] {len(logs)} visit logs loaded')

    # ── Build feature matrix ──
    X, y = [], []
    skipped = 0
    for log in logs:
        prod_idx = PRODUCT_MAP.get(log.get('product_recommended', ''))
        if prod_idx is None:
            skipped += 1
            continue
        tehsil = log.get('visit_tehsil', '')
        tdata  = tehsil_map.get(tehsil)
        if not tdata:
            skipped += 1
            continue
        visit_date = log.get('visit_date')
        if not visit_date:
            skipped += 1
            continue
        if hasattr(visit_date, 'replace'):
            visit_date = visit_date.replace(tzinfo=None)
        else:
            visit_date = datetime.fromisoformat(str(visit_date).replace('Z', ''))

        feat = build_feature_vector(
            visit_date, tdata['crop'], tdata['stages'],
            log.get('visit_type', ''), wa_clicks.get(tehsil, 0)
        )
        X.append(feat)
        y.append(prod_idx)

    print(f'[RF] {len(X)} usable samples ({skipped} skipped)')
    if len(X) < 50:
        print('[RF] Not enough samples. Aborting.')
        sys.exit(1)

    # ── Train ──
    print(f'[RF] Training RandomForestClassifier (50 trees, max_depth=8, n_jobs=-1)...')
    import time
    t0 = time.time()
    clf = RandomForestClassifier(
        n_estimators=50,
        max_depth=8,
        random_state=42,
        n_jobs=-1,          # parallel across all CPU cores
        class_weight='balanced',
    )
    clf.fit(np.array(X), np.array(y))
    elapsed = time.time() - t0
    print(f'[RF] ✓ Trained in {elapsed:.1f}s')

    # Quick accuracy on training set (proxy — no test split for small dataset)
    preds = clf.predict(np.array(X))
    acc   = (preds == np.array(y)).mean()
    print(f'[RF] Training accuracy: {acc:.1%}')

    # ── Serialise ──
    print('[RF] Serialising model to JSON...')
    model_dict = serialize_forest(clf)
    model_dict['trained_on'] = len(X)

    out_path = os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'rfModel.json')
    out_path = os.path.normpath(out_path)
    with open(out_path, 'w') as f:
        json.dump(model_dict, f, separators=(',', ':'))  # compact — no whitespace

    size_kb = os.path.getsize(out_path) / 1024
    print(f'[RF] ✓ Model saved to {out_path} ({size_kb:.0f} KB)')
    print(f'[RF] Done — commit src/data/rfModel.json and push to deploy.')

if __name__ == '__main__':
    main()

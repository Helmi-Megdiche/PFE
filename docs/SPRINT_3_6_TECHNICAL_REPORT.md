# Sprint 3.6 — Classification Accuracy Technical Report

**Project:** PFE Parental Control AI (ESPRIT)  
**Author:** Implementation summary for DeepSeek AI / review handoff  
**Date:** May 2026  
**Commit scope:** `feat(sprint-3.6): improve classification for hentai, guns, drugs, violence`

---

## 1. Executive Summary

Sprint 3.6 addresses false negatives and inconsistent risk labeling in the on-device parental control pipeline. The system combines **ML Kit image labeling**, an **NSFW inference layer** (nsfwjs on backend debug; ML Kit proxy on mobile), **OCR keyword filtering**, and **post-processing rules** to produce a `combinedRiskScore` and `finalCategory` for each screen capture.

Key outcomes:

| Problem | Solution |
|---------|----------|
| Risk YES + category `neutral` | `enforceCategoryConsistency()` — score ≥ 50 never yields `neutral` |
| Guns / drugs / gore missed | Expanded `riskMapping.ts` keyword lists (weapons, drugs, gore) |
| Hentai false negatives | Lower nsfwjs thresholds; ML Kit anime/cartoon proxy on mobile |
| OCR explicit text ignored when vision wrong | Text overrides + OCR→vision boost (Sprint 3.5 extended) |

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Screen Capture (30s)                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
         ┌───────────────────┴───────────────────┐
         ▼                                       ▼
┌─────────────────┐                   ┌─────────────────────┐
│  OCR (ML Kit)   │                   │  Vision Pipeline     │
│  TextRecognition│                   │  ML Kit labels         │
└────────┬────────┘                   │  + nsfwClassifier    │
         │                              │  + riskMapping.ts    │
         ▼                              └──────────┬──────────┘
┌─────────────────┐                              │
│ keywordFilter   │                              │
│ HIGH_RISK terms │                              │
│ gun/drug/violent│                              │
└────────┬────────┘                              │
         │                              ┌────────▼──────────┐
         │                              │ mergeVisionRisk   │
         │                              │ max(mlKit, nsfw)  │
         ▼                              └────────┬──────────┘
┌─────────────────┐                              │
│ ocrRiskScore    │◄─────────────────────────────┤ imageRiskScore
│ (computeOcr)    │                              │
└────────┬────────┘                              │
         │                              ┌────────▼──────────┐
         └──────────────► combineRiskScores ◄───┘ 30% OCR / 70% vision
                             │
                             ▼
              applyPostProcessingOverride (text keywords)
                             │
                             ▼
              enforceCategoryConsistency (no neutral if score≥50)
                             │
                             ▼
                    POST /api/screen-events
```

### Debug endpoint (`POST /api/debug/classify`)

Mirrors mobile logic with server-side **nsfwjs** + **Tesseract.js** instead of ML Kit on-device OCR.

---

## 3. Component Reference

### 3.1 `riskMapping.ts` (Mobile + Backend — must stay in sync)

**Path:** `MobileApp/src/utils/riskMapping.ts`, `backend/src/utils/riskMapping.ts`

Maps ML Kit / MobileNet label strings to weighted categories:

| Category | Weight | Example keywords |
|----------|--------|------------------|
| `adult` | 1.0 | skin, porn, hentai, nude, xxx, lingerie, … |
| `violent` | 1.0 | gun, rifle, knife, bomb, tank, military, … |
| `gore` | 0.9 | blood, wound, corpse, skeleton, … |
| `dangerous` | 0.9 | syringe, pill, alcohol, cigarette, drug, … |
| `educational` | -0.5 | book, classroom, school, … |

**Heuristics (Sprint 3.6):**

- `skin` + `hand` (conf > 0.6) → adult weight 0.8
- `anime|cartoon|comic|manga|illustration|drawing` (conf > 0.55) → adult proxy for hentai
- If `riskScore >= 50` but category would be `neutral` → re-pick highest weighted category (fallback `adult`)

**Output:** `{ category, riskScore, topLabels, categoryWeights }`

### 3.2 `nsfwClassifier.ts` (Mobile only)

**Path:** `MobileApp/src/services/nsfwClassifier.ts`

| Source | When used |
|--------|-----------|
| `path-hint` | URI/path contains hentai, nsfw, porn, xxx |
| `nsfwjs` | If `@tensorflow/tfjs` + nsfwjs added later (10s timeout) |
| `mlkit-proxy` | Default — infers porn/sexy/hentai from ML Kit labels |

**Thresholds (aligned with backend `nsfwVision.ts`):**

```typescript
if (hentai > 0.5 || porn > 0.4 || sexy > 0.6) → riskScore = 100, category = 'adult'
```

**Merge rule in `imageClassifier.ts`:**

```typescript
riskScore = max(mlKitMapped.riskScore, nsfw.riskScore)
```

### 3.3 `keywordFilter.ts`

**Paths:** `MobileApp/src/utils/keywordFilter.ts`, `backend/src/utils/keywordFilter.ts`

Priority order:

1. `HIGH_RISK_KEYWORDS` → `adult` (porn, hentai, xxx, pedo-related terms, …)
2. `VIOLENT_TEXT_KEYWORDS` → `violent` (gun, weapon, bomb, …)
3. `DRUG_TEXT_KEYWORDS` → `dangerous`
4. Legacy `RISK_KEYWORDS` (violent, toxic, dangerous, educational)

`analyzeText()` (backend): adult matches → `riskScore = max(70, score + 70)`.

### 3.4 `riskCombination.ts`

**Key functions:**

| Function | Purpose |
|----------|---------|
| `combineRiskScores(ocr, vision)` | `0.3 × OCR + 0.7 × vision` |
| `resolveCombinedCategory()` | Score axes first; mappedCategory only if not neutral |
| `enforceCategoryConsistency()` | Block neutral when combined ≥ 50 |
| `applyPostProcessingOverride()` | Force ≥85 adult / ≥80 violent / ≥75 drugs from OCR keywords |
| `applyExplicitOcrBoost()` | Boost vision when OCR adult but ML Kit neutral |

### 3.5 `useScreenshotCapture.ts`

Orchestrates per capture cycle:

1. Parallel OCR + `classifyImage()`
2. `keywordFilter(preview)` → `computeOcrRiskScore()`
3. `applyExplicitOcrBoost()`
4. `applyPostProcessingOverride()`
5. `enforceCategoryConsistency()`
6. Payload to `POST /api/screen-events`

---

## 4. Bug Fix: Risk YES + Category Neutral

**Root cause:** `mappedCategory` from ML Kit mapping could be `neutral` while axis scores or combined score were high (e.g. landscape + skin labels).

**Fix:**

1. `resolveCombinedCategory` now prefers **image axis scores** over `mappedCategory` when scores > 0.5.
2. `enforceCategoryConsistency(combinedRiskScore, riskFlag, category, …)` runs last; if `combinedRiskScore >= 50` and category is `neutral`, picks highest axis or defaults to `adult`.

---

## 5. Test Coverage

### Backend (Jest) — 29 tests

- `tests/riskMapping.test.ts` — label mapping
- `tests/debugPipeline.test.ts` — nsfwjs thresholds, gun→violent, OCR overrides
- `tests/foregroundDetection.test.ts`, `tests/scoringEngine.test.ts`

### Mobile (Jest)

- `__tests__/riskMapping.test.ts` — guns, drugs, hentai proxy, consistency
- `__tests__/nsfwClassifier.test.ts` — hentai thresholds
- `__tests__/keywordFilter.test.ts` — explicit OCR fragments

---

## 6. Known Limitations & Future Work

| Limitation | Impact | Recommendation |
|------------|--------|----------------|
| nsfwjs not bundled on mobile (RN 0.74) | Hentai relies on ML Kit cartoon proxy | Upgrade RN + add `@tensorflow/tfjs-react-native` + nsfwjs, or ship TFLite NSFW model |
| ML Kit has no `hentai` label | Proxy from cartoon/illustration | Custom fine-tuned label model |
| OCR quality on screenshots | Broken text may miss keywords | Keep substring matching; consider ML Kit text blocks confidence filter |
| Pedophilia detection | Keyword list only — high false positive risk | Do not rely on keywords alone; use certified CSAM detection APIs where legally required |
| Landscape false positives | Sky/mountain + skin heuristics | Tune educational/neutral dampening |

---

## 7. Configuration Matrix

| Setting | Mobile | Debug API |
|---------|--------|-----------|
| OCR weight | 0.3 | 0.3 |
| Vision weight | 0.7 | 0.7 |
| NSFW hentai threshold | 0.5 | 0.5 |
| NSFW porn threshold | 0.4 | 0.4 |
| NSFW sexy threshold | 0.6 | 0.6 |
| Combined risk flag threshold | > 50 | > 50 |
| OCR adult boost minimum | 70 | 70 |
| Post-process adult floor | 85 | N/A (via keyword analyzeText) |

---

## 8. API Payload Example (after Sprint 3.6)

```json
{
  "timestamp": "2026-05-18T20:00:00.000Z",
  "appPackage": "com.android.chrome",
  "appLabel": "Chrome",
  "extractedTextPreview": "Porn Adult Sex",
  "riskFlag": true,
  "riskScore": 85,
  "imageRiskScore": 72,
  "combinedRiskScore": 85,
  "category": "adult",
  "imageClassificationDetails": {
    "source": "mlkit",
    "mappedCategory": "adult",
    "imageRiskScore": 72,
    "nsfwSource": "mlkit-proxy",
    "categoryWeights": { "adult": 0.85, "violent": 0, "gore": 0, "dangerous": 0 }
  }
}
```

---

## 9. Files Changed (Sprint 3.6)

```
MobileApp/src/utils/riskMapping.ts
MobileApp/src/utils/riskCombination.ts
MobileApp/src/utils/keywordFilter.ts
MobileApp/src/services/imageClassifier.ts
MobileApp/src/services/nsfwClassifier.ts          [NEW]
MobileApp/src/hooks/useScreenshotCapture.ts
MobileApp/src/types/imageClassification.ts
MobileApp/__tests__/riskMapping.test.ts
MobileApp/__tests__/nsfwClassifier.test.ts        [NEW]

backend/src/utils/riskMapping.ts
backend/src/utils/riskCombination.ts
backend/src/utils/keywordFilter.ts
backend/src/debug/nsfwVision.ts
backend/tests/debugPipeline.test.ts
```

---

## 10. Instructions for DeepSeek AI Review

When reviewing or extending this system:

1. **Always sync** `MobileApp/src/utils/riskMapping.ts` and `backend/src/utils/riskMapping.ts`.
2. **Test with** mock labels before device testing: `mapMlKitLabelsToRisk([{ label: 'Gun', confidence: 0.9 }])`.
3. **Validate consistency:** `enforceCategoryConsistency(70, true, 'neutral', …)` must not return `neutral`.
4. **Debug endpoint** is the fastest way to test OCR + nsfwjs without a phone: `demo_dashboard.html` → Vision Model Debug Tool.
5. **Do not lower** pedophilia-related keyword thresholds without legal/compliance review.

---

*End of report.*

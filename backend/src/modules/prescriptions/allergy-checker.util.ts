export interface AllergyConflict {
  itemIndex?: number;
  drugName: string;
  allergyMatched: string;
  severity: 'HIGH' | 'CRITICAL';
  reason: string;
}

export interface CheckAllergyInputItem {
  drugName: string;
  medicineName?: string;
  genericName?: string;
}

const ALLERGY_GROUPS: Record<string, string[]> = {
  penicillin: [
    'penicillin',
    'amoxicillin',
    'ampicillin',
    'augmentin',
    'piperacillin',
    'cloxacillin',
    'dicloxacillin',
    'amoxil',
    'cephalosporin',
    'cephalexin',
    'cefuroxime',
    'ceftriaxone',
    'cefaclor',
  ],
  sulfa: [
    'sulfa',
    'sulfonamide',
    'sulfamethoxazole',
    'bactrim',
    'septra',
    'cotrimoxazole',
    'sulfadiazine',
  ],
  aspirin: [
    'aspirin',
    'acetylsalicylic',
    'ibuprofen',
    'advil',
    'motrin',
    'naproxen',
    'aleve',
    'diclofenac',
    'nsaid',
    'ketorolac',
    'meloxicam',
    'celecoxib',
  ],
  nsaid: [
    'nsaid',
    'ibuprofen',
    'aspirin',
    'naproxen',
    'diclofenac',
    'ketorolac',
    'indomethacin',
    'meloxicam',
    'celecoxib',
  ],
  codeine: [
    'codeine',
    'morphine',
    'tramadol',
    'oxycodone',
    'hydrocodone',
    'fentanyl',
    'opioid',
    'opiate',
  ],
  statin: [
    'atorvastatin',
    'simvastatin',
    'rosuvastatin',
    'pravastatin',
    'statin',
  ],
  quinolone: [
    'ciprofloxacin',
    'levofloxacin',
    'moxifloxacin',
    'ofloxacin',
    'fluoroquinolone',
  ],
  tetracycline: ['doxycycline', 'tetracycline', 'minocycline'],
  macrolide: ['azithromycin', 'clarithromycin', 'erythromycin'],
  paracetamol: ['paracetamol', 'acetaminophen', 'tylenol', 'panadol'],
};

/**
 * Parses known allergies string into distinct normalized tokens/phrases.
 */
export function parseAllergies(raw?: string | null): string[] {
  if (!raw) return [];
  const trimmed = raw.trim().toLowerCase();
  if (['none', 'n/a', 'na', 'no known allergies', 'nkda', 'nil'].includes(trimmed)) {
    return [];
  }
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(
      (s) =>
        s.length > 0 &&
        s !== 'none' &&
        s !== 'n/a' &&
        s !== 'na' &&
        s !== 'no known allergies' &&
        s !== 'nkda',
    );
}

/**
 * Checks a list of prescribed items against a patient's known allergies.
 * Detects exact matches, substring matches, and pharmaceutical cross-reactivities.
 */
export function checkPrescriptionAllergies(
  knownAllergiesRaw: string | null | undefined,
  items: CheckAllergyInputItem[],
): AllergyConflict[] {
  const allergies = parseAllergies(knownAllergiesRaw);
  if (allergies.length === 0 || !items || items.length === 0) return [];

  const conflicts: AllergyConflict[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const candidateTexts = [
      item.drugName,
      item.medicineName,
      item.genericName,
    ]
      .filter((t): t is string => !!t)
      .map((t) => t.toLowerCase());

    for (const allergy of allergies) {
      let matched = false;
      let matchReason = '';

      // 1. Direct substring or inclusion check
      for (const text of candidateTexts) {
        if (text.includes(allergy) || allergy.includes(text)) {
          matched = true;
          matchReason = `Direct match: Prescribed "${item.drugName}" matches patient allergy "${allergy}".`;
          break;
        }
      }

      // 2. Pharmaceutical cross-reactivity group check
      if (!matched) {
        for (const [groupKey, members] of Object.entries(ALLERGY_GROUPS)) {
          const allergyInGroup = allergy.includes(groupKey) || members.some((m) => allergy.includes(m));
          if (allergyInGroup) {
            for (const text of candidateTexts) {
              const textMatchesMember = members.some((m) => text.includes(m));
              if (textMatchesMember) {
                matched = true;
                matchReason = `Cross-reactivity warning: Prescribed "${item.drugName}" belongs to the ${groupKey.toUpperCase()} drug family, matching patient allergy "${allergy}".`;
                break;
              }
            }
          }
          if (matched) break;
        }
      }

      if (matched) {
        conflicts.push({
          itemIndex: i,
          drugName: item.drugName,
          allergyMatched: allergy,
          severity: 'CRITICAL',
          reason: matchReason,
        });
      }
    }
  }

  return conflicts;
}

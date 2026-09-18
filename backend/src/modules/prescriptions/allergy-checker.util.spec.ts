import {
  checkPrescriptionAllergies,
  parseAllergies,
} from './allergy-checker.util';

describe('Allergy Checker Utility', () => {
  describe('parseAllergies', () => {
    it('should parse comma and semicolon separated allergies', () => {
      const parsed = parseAllergies('Penicillin, Aspirin; Sulfa drugs');
      expect(parsed).toEqual(['penicillin', 'aspirin', 'sulfa drugs']);
    });

    it('should filter out empty and placeholder strings', () => {
      expect(parseAllergies('')).toEqual([]);
      expect(parseAllergies(null)).toEqual([]);
      expect(parseAllergies('None')).toEqual([]);
      expect(parseAllergies('N/A')).toEqual([]);
    });
  });

  describe('checkPrescriptionAllergies', () => {
    it('should detect direct match between allergy and prescribed drug', () => {
      const allergies = 'Aspirin, Penicillin';
      const items = [
        { drugName: 'Aspirin 81mg' },
        { drugName: 'Loratadine 10mg' },
      ];

      const conflicts = checkPrescriptionAllergies(allergies, items);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].drugName).toBe('Aspirin 81mg');
      expect(conflicts[0].allergyMatched).toBe('aspirin');
    });

    it('should detect cross-reactivity for penicillin allergy when prescribing amoxicillin', () => {
      const allergies = 'Penicillin allergy';
      const items = [
        {
          drugName: 'Amoxicillin 500mg',
          genericName: 'Amoxicillin trihydrate',
        },
      ];

      const conflicts = checkPrescriptionAllergies(allergies, items);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].allergyMatched).toBe('penicillin allergy');
      expect(conflicts[0].reason).toContain('PENICILLIN');
    });

    it('should detect cross-reactivity for aspirin allergy when prescribing ibuprofen', () => {
      const allergies = 'Aspirin';
      const items = [{ drugName: 'Ibuprofen 400mg' }];

      const conflicts = checkPrescriptionAllergies(allergies, items);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].allergyMatched).toBe('aspirin');
    });

    it('should return no conflicts when prescribed medications are safe', () => {
      const allergies = 'Penicillin';
      const items = [
        { drugName: 'Cetirizine 10mg' },
        { drugName: 'Metformin 500mg' },
      ];

      const conflicts = checkPrescriptionAllergies(allergies, items);
      expect(conflicts).toHaveLength(0);
    });
  });
});

import { BOSS_LOOK, SPECIES_BY_ID, type Look } from '../shared/species';

export function lookOf(species: string): Look {
  if (species === 'boss') return BOSS_LOOK;
  return SPECIES_BY_ID.get(species)?.look ?? SPECIES_BY_ID.get('caterpillar')!.look;
}

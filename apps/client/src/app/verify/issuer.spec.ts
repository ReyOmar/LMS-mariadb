import { issuedBy } from './issuer';

describe('issuedBy', () => {
  it('nombra la plataforma y la sede que lo emitió', () => {
    expect(issuedBy({ country: 'MEXICO', platformName: 'PESV Education' })).toBe(
      'Emitido por PESV Education · sede México.',
    );
    expect(issuedBy({ country: 'COLOMBIA', platformName: 'Campus PESV' })).toBe(
      'Emitido por Campus PESV · sede Colombia.',
    );
  });
});

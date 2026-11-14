import { Country } from '../common/domain/country';

/** El sistema que hace la petición: su sede es la de todo lo que pida. */
export interface IntegrationCaller {
  id: number;
  name: string;
  country: Country;
}

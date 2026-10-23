import { getMetadataStorage } from 'class-validator';

/** El tope de `@MaxLength` de una propiedad de un DTO, o `undefined` si no tiene. */
export function maxLengthOf(dto: new () => object, property: string): number | undefined {
  const rule = getMetadataStorage()
    .getTargetValidationMetadatas(dto, '', true, false)
    .find((metadata) => metadata.propertyName === property && metadata.name === 'maxLength');
  return rule?.constraints[0] as number | undefined;
}

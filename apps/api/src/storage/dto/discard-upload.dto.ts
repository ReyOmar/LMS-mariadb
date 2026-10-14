import { IsString } from 'class-validator';
import { IsStorageKey } from '../storage-key.validator';
import { UPLOAD_FOLDERS } from '../folders';

export class DiscardUploadDto {
  /** Clave tal como la devolvió la subida. */
  @IsString()
  @IsStorageKey(UPLOAD_FOLDERS)
  key: string;
}

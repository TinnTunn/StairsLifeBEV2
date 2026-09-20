// Dekorator penanda peran yang boleh mengakses sebuah endpoint.

import { SetMetadata } from '@nestjs/common';

export const Roles = (...roles: string[]) => SetMetadata('roles', roles);

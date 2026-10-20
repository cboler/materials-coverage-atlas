import { Routes } from '@angular/router';
import { AtlasComponent } from './atlas/atlas.component';
import { StatusComponent } from './status/status.component';

export const routes: Routes = [
  {
    path: '',
    component: AtlasComponent,
    title: 'Materials Coverage Atlas',
  },
  {
    path: 'status',
    component: StatusComponent,
    title: 'Status & Diagnostics • Materials Coverage Atlas',
  },
  {
    path: '**',
    redirectTo: '',
  },
];

import { Routes } from '@angular/router';
import { AtlasComponent } from './atlas/atlas.component';

export const routes: Routes = [
  {
    path: '',
    component: AtlasComponent,
    title: 'Materials Coverage Atlas',
  },
  {
    path: '**',
    redirectTo: '',
  },
];

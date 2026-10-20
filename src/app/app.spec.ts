import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { AtlasComponent } from './atlas/atlas.component';
import { FIXTURE } from './atlas/atlas-fixture';
import { routes } from './app.routes';

function mockFetch(response: Response) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
}

describe('Application Tests', () => {
  beforeEach(async () => {
    mockFetch(new Response('not found', { status: 404 }));
    await TestBed.configureTestingModule({
      imports: [App, AtlasComponent],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  afterEach(() => vi.restoreAllMocks());

  describe('App Shell', () => {
    it('should render the brand title', async () => {
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.brand-title')?.textContent).toContain(
        'Materials Coverage Atlas',
      );
    });

    it('should render the skip link', async () => {
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.skip-link')?.getAttribute('href')).toBe('#main-content');
    });
  });

  describe('AtlasComponent', () => {
    it('should explain how to generate data when atlas.json is missing', async () => {
      const fixture = TestBed.createComponent(AtlasComponent);
      await fixture.whenStable();
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('#atlas-title')?.textContent).toContain('coverage atlas');
      expect(compiled.querySelector('#atlas-missing')?.textContent).toContain('build_atlas.py');
    });

    it('should render overlays, legend, anchors, coverage table and rules from data', async () => {
      vi.restoreAllMocks();
      mockFetch(new Response(JSON.stringify(FIXTURE), { status: 200 }));
      const fixture = TestBed.createComponent(AtlasComponent);
      await fixture.whenStable();
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;

      expect(compiled.querySelectorAll('[aria-label="Color the map by"] .chip')).toHaveLength(5);
      expect(compiled.querySelector('#toggle-contours')?.getAttribute('aria-pressed')).toBe('true');
      expect(compiled.querySelector('#toggle-regions')?.getAttribute('aria-pressed')).toBe('true');
      expect(compiled.querySelectorAll('.legend-item')).toHaveLength(5);
      expect(compiled.querySelector('.anchor-list')?.textContent).toContain('Corundum');

      // Plain-language guidance: the reading guide and a meaning for each category.
      const guide = compiled.querySelector('app-atlas-guide')?.textContent ?? '';
      expect(guide).toContain('Why is a dot where it is?');
      expect(guide).toContain('About 50% of these have also been made in a lab');
      expect(compiled.querySelector('.legend-help')?.textContent).toContain('carry loads');
      expect(compiled.querySelectorAll('tbody tr')).toHaveLength(6);
      expect(compiled.querySelector('.rules')?.textContent).toContain('stiff');

      (compiled.querySelector('#overlay-elastic') as HTMLButtonElement).click();
      fixture.detectChanges();
      const labels = [...compiled.querySelectorAll('.legend-label')].map((e) => e.textContent);
      expect(labels).toEqual(['Stiffness computed', 'No stiffness data']);
    });

    it('should show the detail card when an anchor is selected', async () => {
      vi.restoreAllMocks();
      mockFetch(new Response(JSON.stringify(FIXTURE), { status: 200 }));
      const fixture = TestBed.createComponent(AtlasComponent);
      await fixture.whenStable();
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;

      (compiled.querySelector('.anchor-list .link-button') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(compiled.querySelector('#selected-detail')?.textContent).toContain('Al2O3');
    });
  });
});

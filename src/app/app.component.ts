import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PrimeNGConfig } from 'primeng/api';
import { Aura } from 'primeng/themes/aura';

@Component({
    selector: 'app-root',
    imports: [RouterOutlet],
    templateUrl: './app.component.html',
    styleUrl: './app.component.css'
})
export class AppComponent {
  private primeConfig = inject(PrimeNGConfig);

  constructor() {
    this.primeConfig.theme.set({
      preset: Aura,
      options: {
        darkModeSelector: '.dark',
        cssLayer: {
          order: 'tailwind-base, primeng, tailwind-utilities',
        },
      },
    });
  }

  title = 'PuzzleBreak';
}

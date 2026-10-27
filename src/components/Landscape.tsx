/** Original geometric landscapes authored for PORT; no game or third-party artwork. */
import { useId } from "react";
export function Landscape({
  kind = "jungle",
  className = "",
}: {
  kind?: string;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const snow = kind === "snow";
  const desert = kind === "desert";
  const colors = snow
    ? ["#a1b3c0", "#526d81", "#283f50", "#162a37", "#0a1720"]
    : desert
      ? ["#d7b787", "#ae7950", "#82533a", "#513d30", "#282d29"]
      : ["#c2c4a2", "#75958a", "#446f68", "#284a43", "#142e2d"];
  return (
    <svg
      className={`landscape ${className}`}
      viewBox="0 0 1400 760"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={
        snow
          ? "Авторская иллюстрация горного монастыря"
          : desert
            ? "Авторская иллюстрация затерянного города в пустыне"
            : "Авторская иллюстрация древнего храма в джунглях"
      }
    >
      <defs>
        <linearGradient id={`${id}sky`} x2="0.1" y2="1">
          <stop stopColor={colors[0]} />
          <stop offset="1" stopColor={colors[2]} />
        </linearGradient>
        <radialGradient id={`${id}sun`}>
          <stop stopColor="#fff5ce" stopOpacity=".6" />
          <stop offset="1" stopColor="#fff5ce" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}mist`} x2="0" y2="1">
          <stop stopColor={colors[0]} stopOpacity=".35" />
          <stop offset="1" stopColor={colors[0]} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path fill={`url(#${id}sky)`} d="M0 0h1400v760H0z" />
      <ellipse cx="1050" cy="160" rx="430" ry="290" fill={`url(#${id}sun)`} />
      <path
        d="M0 355 130 240 230 292 360 180 470 245 610 110 750 270 870 193 1020 265 1150 150 1400 320V760H0Z"
        fill={colors[1]}
      />
      {snow && (
        <path
          d="m360 180-58 90 65-30 50 30-20-30Zm250-70-100 140 93-60 52 38-17-65Zm540 40-80 110 76-47 72 50Z"
          fill="#d7dedd"
          opacity=".8"
        />
      )}
      <path
        d="M0 440 170 380 260 435 420 290 580 383 700 300 790 345 910 275 1040 355 1170 280 1400 385V760H0Z"
        fill={colors[2]}
      />
      <path d="M0 450h1400v180H0z" fill={`url(#${id}mist)`} />
      <g fill={colors[3]}>
        <path d="M740 470h440v30H740zM770 430h380v40H770zM800 400h325v30H800zM835 340h260v60H835zM865 310h200v30H865zM900 270h130v40H900zM930 240h70v30H930z" />
        <path d="M820 400V295h28v105zm270 0V295h24v105zm-233-60v-82h12v82zm194 0v-82h12v82z" />
        <path d="M766 470V360h30v110zm365 0V360h30v110z" />
      </g>
      <g fill={colors[1]} opacity=".55">
        <path d="M938 320h10v20h-10zm25 0h10v20h-10zm25 0h10v20h-10zm-99 35h12v35h-12zm38 0h12v35h-12zm38 0h12v35h-12zm38 0h12v35h-12zm38 0h12v35h-12z" />
      </g>
      <path
        d="M0 560 145 490 300 545 475 470 640 550 820 505 1000 575 1200 480 1400 535V760H0Z"
        fill={colors[3]}
      />
      <path
        d="M0 640 200 570 380 630 550 580 710 660 1000 640 1180 580 1400 620V760H0Z"
        fill={colors[4]}
      />
      <path
        d="m880 500-60 80 68 10-40 50 150 120h155L918 628l35-44-90-20 55-64Z"
        fill={colors[0]}
        opacity=".18"
      />
      {!desert && (
        <g fill={colors[4]}>
          <path d="M80 760 105 70h22l38 690Z" />
          <path d="M115 145 0 40v75l105 120Zm2 80L300 0h-75L110 160ZM95 355 0 260v50l98 105ZM128 410l185-176-26-17-168 137Z" />
          <path d="M1330 760 1298 180h-20l-20 580Z" />
          <path d="m1290 340 110-135v65l-106 136Zm-5 60-150-125 20-20 140 86Z" />
          <path d="M0 0h465L350 72l-89-16-73 76L100 94 0 160Zm1400 0h-280l35 60 82 12 70 80 93-32Z" />
        </g>
      )}
      {desert && (
        <g fill={colors[4]}>
          <path d="M65 670V320h70v350zm-20-350 55-130 60 130zm1140 380V390h85v310zm-20-310 60-145 67 145Z" />
          <path d="M15 670h220v90H15zm1115 0h270v90h-270Z" />
        </g>
      )}
      <g fill="#f5ebc6" opacity=".5">
        <circle cx="1100" cy="460" r="1.6" />
        <circle cx="1220" cy="420" r="1" />
        <circle cx="620" cy="370" r="1.4" />
        <circle cx="740" cy="200" r="1" />
      </g>
      <g fill="none" stroke={colors[4]} strokeWidth="2" opacity=".5">
        <path d="m1040 200 10-4 10 4m35-25 8-3 8 3m-90-3 6-3 6 3" />
      </g>
    </svg>
  );
}

import { Link } from "react-router-dom";

type Props = {
  regionLabel?: string;
};

export default function Footer({ regionLabel }: Props) {
  return (
    <footer className="footer">
      <div className="wrap footer__inner">
        <div>
          © 2026 Claim My Train
          {regionLabel ? (
            <>
              {" "}· {regionLabel} · <Link to="/">All regions</Link>
            </>
          ) : (
            <> · Made in Sweden.</>
          )}
        </div>
        <div className="footer__links">
          <a href="#">Privacy</a>
          <a href="#">How we file claims</a>
          <a href="#">Open source</a>
        </div>
      </div>
    </footer>
  );
}

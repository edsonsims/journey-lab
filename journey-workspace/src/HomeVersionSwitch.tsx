import {AppLink} from './App';
import './home-version-switch.css';

type Props={version:'v1'|'v2'|'v3';navigate:(path:string)=>void};

export function HomeVersionSwitch({version,navigate}:Props){
 return <nav className="home-version-switch" aria-label="Home versions">
  <AppLink to="/?home=v1" navigate={navigate} current={version==='v1'?'page':undefined}>Home v1</AppLink>
  <AppLink to="/?home=v2" navigate={navigate} current={version==='v2'?'page':undefined}>Home v2</AppLink>
  <AppLink to="/" navigate={navigate} current={version==='v3'?'page':undefined}>Home v3</AppLink>
 </nav>;
}

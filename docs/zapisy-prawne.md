# Zapisy prawne czytane na głos

Zebrane przez dwóch agentów (odwołania do przepisów; skróty kodeksów i ustaw) i sprawdzone przeciwko kodowi (`src/lib/say.ts`: `sayProvisions`, `sayCodes`; dane kodeksów: `src/lib/codes-pl.ts`, tabela niżej jest z niego). Źródła pisane (PWN, RJP, Zasady techniki prawodawczej) są w sekcji „Źródła”; praktykę sądów i Sejmu agent podał z pamięci. Brzmienie nie było odsłuchane.

## Jak czytane są odwołania

- **Artykuł.** „art. 5” → „artykuł piąty”, do 99 liczebnik porządkowy; od 100 liczebnik główny, który się nie odmienia: „zgodnie z art. 506” → „zgodnie z artykułem pięćset sześć”, „w art. 506” → „w artykule pięćset sześć”. Numer z literą jest liczebnikiem głównym i nazwą litery: „art. 56a” → „artykuł pięćdziesiąt sześć a”, „ust. 2a” → „ustęp dwa a”, „pkt 3b” → „punkt trzy be”. Indeks górny: „art. 402¹”, „art. 402(1)” → „artykuł czterysta dwa indeks górny jeden”; zapis, w którym indeks stracił podniesioną pozycję („art. 4021”), jest rozbijany, gdy liczba jest większa niż 1300 (żaden artykuł polskiego kodeksu nie ma takiego numeru).
- **Paragraf.** „§ 1” → „paragraf pierwszy” (nie „jeden”), tak samo jak artykuł: „paragrafu piątego”, „w paragrafie piątym”, „§ 123” → „paragraf sto dwadzieścia trzy”. „§§ 2-4” → „paragrafy od drugiego do czwartego”.
- **Odmienia się tylko pierwszy człon.** Pierwszy człon odwołania (artykuł, paragraf albo ustęp, od którego odwołanie się zaczyna) bierze przypadek ze słów przed nim; reszta stoi w mianowniku, tak jak mówią prawnicy: „na podstawie art. 5 ust. 2 pkt 3 lit. a” → „na podstawie artykułu piątego ustęp drugi punkt trzeci litera a”. Litera po „lit.” jest czytana nazwą („lit. b” → „litera be”, „wu” i „zet” zamiast przyimków).
- **Przypadek pierwszego członu** wynika ze słowa przed nim: mianownik na początku zdania, po dwukropku, przecinku i orzeczniku („podstawą jest art. 3”), biernik po „naruszył”, „stosuje się”, „uchyla się”, „zob.”, dopełniacz po „na podstawie”, „na mocy”, „w myśl”, „do”, „od”, „według”, „z” (i po rzeczowniku: „naruszenie art. 5”), narzędnik po „zgodnie z”, „w związku z” (w zw. z), „wraz z”, „łącznie z”, „sprzeczny z”, miejscownik po „w”, „po”, „przy” i „opiera się na”, celownik po „wbrew”, „dzięki”. W wyliczeniu („w art. 5 i art. 6”) kolejne człony mają ten sam przypadek. Gdy przypadku nie da się ustalić, zostaje dopełniacz.
- **Wyliczenia i zakresy.** „art. 5 i 6” → „artykuły piąty i szósty” (w dopełniaczu „artykułów piątego i szóstego”), „art. 5-7” → „artykuły od piątego do siódmego”; jeden rodzaj liczebnika w całym wyliczeniu: jeśli któryś numer ma 100 lub więcej albo literę, wszystkie są główne („art. 98-101” → „artykuły od dziewięćdziesiąt osiem do sto jeden”). Przy kolejnych członach łańcucha liczba mnoga stoi tylko przy zakresie („ustępy od pierwszego do trzeciego”), a lista zostaje przy liczbie pojedynczej („ustęp pierwszy i drugi”).
- **Pozostałe człony.** zd. → „zdanie pierwsze”, tiret → „tiret drugie” (rodzaj nijaki), rozdz., dz., oddz., tyt. z liczbą rzymską lub arabską („rozdz. II” → „rozdział drugi”), pełne słowa „dział”, „tytuł”, „część”, „księga” z liczbą rzymską; „zał. nr 1” i „załącznik nr 1” → „załącznik numer jeden” (po „numer” liczebnik główny); „poz. 12” poza dziennikiem → „pozycja dwunasta” (po „zajęła poz. 12” → „pozycję dwunastą”). „pkt 3” po liczbie nie jest przepisem, tylko punktami („o 25 pkt”, „100 pkt bazowych”, „1,5 pkt proc.” zostają punktami; liczbę przed „pkt” w łańcuchu, np. „ust. 2 pkt 3”, bierze łańcuch). Tekst obcy („Art. 5 of the Directive”, „§ 240.10b-5”) zostaje.
- **Dzienniki.** „Dz.U. z 2024 r. poz. 1234” i „Dz.U. 2024 poz. 1234” → „Dziennik Ustaw z dwa tysiące dwudziestego czwartego roku, pozycja tysiąc dwieście trzydzieści cztery” (pozycja jest numerem rejestru, więc zawsze liczebnik główny); „Dz.U. Nr 94, poz. 1037” → „Dziennik Ustaw numer dziewięćdziesiąt cztery, pozycja tysiąc trzydzieści siedem”; odmiana po „w” („w Dzienniku Ustaw”) i „z”, „do”, „od” („z Dziennika Ustaw”). Tak samo „M.P.” (tylko z rokiem, numerem albo pozycją: to też inicjały), „Dz. Urz. UE”, „Dz. Urz. KNF”. „t.j.” → „tekst jednolity”, „ze zm.” → „ze zmianami”, „z późn. zm.” → „z późniejszymi zmianami”, „w zw. z” → „w związku z”, „zob.” → „zobacz”, „por.” przed przepisem → „porównaj”.

## Kodeksy i ustawy

Skrót po odwołaniu do przepisu (art., §, ust., pkt, lit., zd.) jest zawsze tym kodeksem (ustawą) w dopełniaczu: „art. 506 § 1 kc” → „artykuł pięćset sześć paragraf pierwszy kodeksu cywilnego”, „art. 233 § 1 k.k.” → „… kodeksu karnego”, „§ 2 pkt 3 KSH” → „paragraf drugi punkt trzeci kodeksu spółek handlowych”; ta sama reguła dla „MAR” („art. 17 ust. 1 MAR” → „… rozporządzenia Mar”). Kropka skrótu („k.c.”) zostaje jako koniec zdania, gdy zdanie się tam kończy.

Poza odwołaniem skrót jest czytany tylko wtedy, gdy zapis nie znaczy czego innego (kolumny „Zawsze” i „Przy słowach prawa” niżej), w przypadku, którego wymaga zdanie („przepisy KSH” → „przepisy kodeksu spółek handlowych”, „w Kc” → „w kodeksie cywilnym”, „zgodnie z Kpc” → „zgodnie z kodeksem postępowania cywilnego”, „KSH stanowi” → „kodeks spółek handlowych stanowi”, „znowelizowany Kc” → „znowelizowany kodeks cywilny”). Wyliczenie („kc i ksh”, „KC, KSH oraz KPC”) jest czytane razem, w jednym przypadku, z powtórzonym „kodeks”. Zapis w nawiasie po pełnej nazwie („kodeks spółek handlowych (dalej: KSH)”) jest pomijany. Pełnych nazw nie ruszamy; „CIT”, „PIT”, „VAT” po „ustawa o” zostają jak były (czytane jak słowa: „cit”, „pit”, „wat”).

Dwuliterowe kodeksy zapisane małymi („kc”, „kk”, „kp”, „kw”, „km”) albo wielkimi literami („KC”, „KK”, „KP”, „KW”, „KM”) są kodeksem tylko po odwołaniu do przepisu (zapis z wielką pierwszą literą „Kc”, „Kk”, „Kp” jest czytany także sam, „Kw” i „Km” przy słowach prawa, a zapis z kropkami „k.c.” przy słowach prawa): KM to konie mechaniczne, KW kilowat albo księga wieczysta, KC Komitet Centralny, KK Kościół katolicki. Gdy obok stoją słowa z innego świata (KSH przy „Węgry”, „forint”, „inflacja”; KPK przy „Indonezja”; KPC przy „ropa”, „baryłki”; KKS przy „klub”, „mecz”; KKW przy „Greifswald”, „elektrownia”), skrót zostaje. Liczba przed skrótem („150 KM”, „100 kPa”) też go zostawia.

| Kodeks / ustawa | Po odwołaniu | Przy słowach prawa | Zawsze | Co jeszcze znaczą te litery |
|---|---|---|---|---|
| kodeks cywilny | kc, KC | k.c. | Kc | KC = Komitet Centralny (KC PZPR, KC KPZR, KC KPCh) w tekstach historycznych i o Chinach; KC = Kansas City (KC Chiefs, KC Royals, Kansas City Southern) w sporcie i o spółkach; Komisja Centralna (?); z kropkami (k.c.) praktycznie bez kolizji |
| kodeks spółek handlowych | – | – | k.s.h., ksh, KSH, Ksh | KSH = Központi Statisztikai Hivatal, węgierski urząd statystyczny (dane KSH o inflacji i produkcji; częste w depeszach o Węgrzech i forincie); KSh = szyling kenijski (KSh 500); ksh = powłoka Korn shell (informatyka); k.s.h. z kropkami bez kolizji |
| kodeks postępowania cywilnego | – | – | k.p.c., kpc, KPC, Kpc | KPC = Kuwait Petroleum Corporation (spółka naftowa); kpc = kiloparsek (astronomia, z liczbą: 10 kpc); k.p.c. z kropkami bez kolizji |
| kodeks karny | kk, KK | k.k. | Kk | KK = Kościół katolicki (publicystyka: skandale w KK); K.K./KK = japońska spółka akcyjna kabushiki kaisha (Toyota Industries K.K.); kk = „okej” w czacie; KK = karta kredytowa (potocznie, ?); inicjały K.K.; k.k. małymi z kropkami bez znanej kolizji |
| kodeks karny skarbowy | – | – | k.k.s., kks, KKS, Kks | KKS = klub sportowy (KKS Lech Poznań = Kolejowy Klub Sportowy, KKS Kalisz); k.k.s. z kropkami bez kolizji |
| kodeks karny wykonawczy | – | – | k.k.w., kkw, KKW, Kkw | KKW = Kernkraftwerk, elektrownia jądrowa po niemiecku (KKW Greifswald w NRD); inne skróty (np. komitety, komisje) niepotwierdzone (?); k.k.w. z kropkami bez kolizji |
| kodeks postępowania karnego | – | – | k.p.k., kpk, KPK, Kpk | KPK = Komisi Pemberantasan Korupsi (indonezyjska komisja antykorupcyjna); KPK = Kodeks prawa kanonicznego (po „kan.”, w tekstach o Kościele); k.p.k. z kropkami bez kolizji z wyjątkiem prawa kanonicznego |
| kodeks pracy | kp, KP | k.p. | Kp | KP = Komisariat Policji; klub parlamentarny; dokument kasowy „kasa przyjęła” (KP 15/2025); inicjały K.P.; człon nazw klubów (KP = Klub Piłkarski/Pływacki, ?); kp w notacji szachowej (?) |
| kodeks rodzinny i opiekuńczy | – | kro, KRO, Kro | k.r.o. | brak znanej kolizji w komunikatach (?); duńskie/norweskie „kro” = gospody (Ribe Kro) w nazwach obcych; k.r.o. tylko z kropkami według Języka Ojczystego (ostatni wyraz zaczyna się samogłoską) |
| kodeks postępowania administracyjnego | – | KPA | k.p.a., kpa, Kpa | kPa = kilopaskal (ciśnienie, z liczbą: 250 kPa); KPA = Korean People's Army, Koreańska Armia Ludowa; k.p.a. z kropkami bez kolizji |
| kodeks wykroczeń | kw, KW | k.w., Kw | – | kW = kilowat (z liczbą: 30 kW); KW = Kopalnia Węgla / Kompania Węglowa (KW S.A.); księga wieczysta (KW nr KR1P/00012345/6); „kasa wypłaci” (KW 12/2025); komitet wyborczy (KW PiS); Komenda Wojewódzka (Policji, PSP); kalendarzowy tydzień (KW 42); kw. = kwartał (III kw.); kw. = kwiecień/kwaśny; kapitał własny (?) |
| kodeks postępowania w sprawach o wykroczenia | – | – | k.p.w., kpw, KPW, Kpw, k.p.s.w., kpsw, KPSW, Kpsw | brak znanej kolizji dla KPW (?); KPSW = m.in. Kujawsko-Pomorska Szkoła Wyższa (KPSW Bydgoszcz) – tylko po odwołaniu; oba zapisy (k.p.w. i k.p.s.w.) w obiegu |
| kodeks morski | km, KM | k.m., Km | – | KM = konie mechaniczne (silnik 150 KM); KM = marka konwertybilna, waluta Bośni i Hercegowiny (100 KM); km = kilometr (z liczbą); KM = Komitet Miejski (historycznie, ?); inicjały K.M. |
| kodeks wyborczy | KWyb | – | k.wyb., kwyb, Kwyb | brak kolizji dla k.wyb.; UWAGA: k.w./KW to kodeks wykroczeń, nie wyborczy; KW bywa też komitetem wyborczym (KW PiS) |
| unijny kodeks celny | UKC, ukc, Ukc | – | – | unijny kodeks celny = rozporządzenie UE 952/2013 (nie ustawa); UKC = United Kennel Club (rodowody psów, ?) |
| ordynacja podatkowa | op, OP, Op | o.p., Ord. pod., Ord.pod. | – | op. = opus (op. 27 Chopina); OP = Ordo Praedicatorum, dominikanie (o. Jan Kowalski OP); OP = Opole (tablice); OP = „oferta publiczna”/„operating profit” w tekstach finansowych (?); o.p. z kropkami przy art. bez kolizji |
| prawo upadłościowe | p.u., pu, PU, Pu | – | pr. upadł., pr.upadł., Pr. upadł., Pr.upadł. | PU = poliuretan (pianka PU); Pu = pluton (symbol chemiczny); PU = „pull-up”/inne (?) |
| prawo restrukturyzacyjne | p.r., PR, Pr | – | pr. restrukt., pr.restrukt., Pr. restrukt. | PR = public relations; PR = Polskie Radio (PR1, PR24); PR = Puerto Rico; pr. = „prawo” w skrótach; p.r. = pro rata (?) |
| prawo bankowe | pb, PB, Pb | – | pr. bank., pr.bank., Pr. bank., Pr.bank. | pb = punkt bazowy (obniżka o 25 pb); PB = petabajt; Pb = ołów; PB = personal best (sport); p.b. bywa też skrótem Prawa budowlanego (pr. bud.) – dwuznaczne bez słów bankowych/budowlanych |
| prawo budowlane | – | – | pr. bud., pr.bud., Pr. bud., Pr.bud. | p.b. = także Prawo bankowe (dwuznaczne); PB = personal best; pb = punkt bazowy |
| prawo zamówień publicznych | – | PZP | p.z.p., pzp, Pzp | PZP = Polski Związek Pływacki (?), inne związki sportowe (?); oficjalny skrót ustawy to Pzp; p.z.p. z kropkami bez kolizji |
| ustawa o obrocie instrumentami finansowymi | – | uoif, UOIF, Uoif, UoIF | u.o.i.f. | brak znanej kolizji |
| ustawa o ofercie publicznej | uop, UOP, Uop | u.o.p. | – | UOP = Urząd Ochrony Państwa (były funkcjonariusz UOP); UoP = umowa o pracę (zatrudniony na UoP); UOP LLC = amerykańska spółka (Honeywell UOP); u.o.p. = także ustawa o ochronie przyrody (rozstrzyga kontekst rynku kapitałowego) |
| ustawa o rachunkowości | – | uor, UOR, Uor, UoR | u.o.r. | brak znanej kolizji (?); u.o.r. = także ustawa o radiofonii (rzadko, ?) |
| ustawa o podatku dochodowym od osób prawnych | – | updop, UPDOP, Updop, UPDoP | u.p.d.o.p. | brak kolizji dla skrótu; wzorzec „ustaw* o CIT” oznacza tę ustawę, ale „CIT” sam to nazwa podatku (nie rozwijać; CIT = też Cash In Transit, CIT Group) |
| ustawa o podatku dochodowym od osób fizycznych | – | updof, UPDOF, Updof, UPDoF | u.p.d.o.f. | brak kolizji dla skrótu; wzorzec „ustaw* o PIT”; „PIT” sam = nazwa podatku lub formularz (PIT-37), pit stop |
| ustawa o podatku od towarów i usług | – | uptu, UPTU, Uptu | u.p.t.u. | brak kolizji dla skrótu; wzorzec „ustaw* o VAT”; „VAT” sam = nazwa podatku (nie rozwijać) |
| ustawa o swobodzie działalności gospodarczej | – | usdg, uśdg, USDG, UŚDG, Usdg, Uśdg | u.s.d.g., u.ś.d.g. | brak kolizji; UWAGA: ustawa uchylona z dniem 30.04.2018 (zastąpiona Prawem przedsiębiorców) – spotykana w starszych tekstach i odesłaniach |
| prawo przedsiębiorców | pp, PP, Pp | – | pr. przeds., pr.przeds., Pr. przeds. | p.p./pp. = punkty procentowe (wzrost o 2 p.p.) – bardzo częste; pp. = „państwo”/„panowie”; PP = Polska Press i inne |
| ustawa o funduszach inwestycyjnych | ufi, UFI, Ufi | u.f.i. | – | UFI = Unique Formula Identifier (kod na etykietach chemicznych, ?); UFI = Global Association of the Exhibition Industry (?); u.f.i. z kropkami bez kolizji |
| ustawa o nadzorze nad rynkiem kapitałowym | – | unrk, UNRK, Unrk | u.n.r.k. | brak znanej kolizji |
| ustawa o Krajowym Rejestrze Sądowym | – | ukrs, UKRS, Ukrs | u.k.r.s. | brak kolizji dla u.k.r.s.; sama „KRS” to rejestr/Krajowa Rada Sądownictwa (nie rozwijać jako ustawy) |
| ustawa o biegłych rewidentach | – | ubr, UBR, Ubr | u.b.r. | brak znanej kolizji (?) |
| ustawa o ochronie konkurencji i konsumentów | uokik, Uokik | u.o.k.i.k., u.o.k.k., u.o.k.ik. | – | UOKiK (wielkie litery, bez kropek) = Urząd Ochrony Konkurencji i Konsumentów, ORGAN, nie ustawa; „Prezes UOKiK nałożył karę” |
| ustawa o ochronie danych osobowych | uodo, UODO, Uodo | u.o.d.o. | – | UODO = Urząd Ochrony Danych Osobowych, ORGAN (Prezes UODO); uodo bez kropek bywa organem |
| ustawa o księgach wieczystych i hipotece | – | ukwh, UKWH, Ukwh | u.k.w.h. | brak kolizji dla u.k.w.h. (KW = księga wieczysta osobno) |
| ustawa o gospodarce nieruchomościami | – | ugn, UGN, Ugn | u.g.n. | brak znanej kolizji (?) |
| prawo energetyczne | p.e., pe, PE, Pe | – | pr. energ., pr.energ., Pr. energ. | PE = Parlament Europejski; PE = private equity; PE = polietylen; P/E = wskaźnik cena/zysk; pe = „na przykład” w skrócie? (?) |
| prawo geologiczne i górnicze | p.g.g., pgg, Pgg, PGG | – | – | PGG = Polska Grupa Górnicza (spółka węglowa; „PGG wydobyła 25 mln ton”) – nigdy nie rozwijać jako ustawy bez odwołania do przepisu |
| ustawa o podatku od czynności cywilnoprawnych | – | upcc, UPCC, Upcc | u.p.c.c. | brak kolizji dla skrótu; „PCC” sam = nazwa podatku (nie rozwijać) |
| ustawa o podatkach i opłatach lokalnych | – | upol, UPOL, Upol | u.p.o.l. | brak znanej kolizji (?) |
| ustawa o działalności ubezpieczeniowej i reasekuracyjnej | – | udur, UDUR, Udur | u.d.u.r. | brak znanej kolizji (?) |
| ustawa o pracowniczych planach kapitałowych | – | uppk, UPPK, Uppk | u.p.p.k. | brak kolizji dla skrótu; „PPK” sam = plan (nie rozwijać jako ustawy) |

## Czego nie robi

- „tzw.”, „ww.”, „cyt.”, „wyd.”, „s.” (strona), „nr” poza załącznikiem i dziennikiem, „art.” bez kropki, „art. 5 do 7”, listy pozycji („poz. 1234, 1235 i 1236”) zostają jak były.
- Pełna odmiana liczebnika głównego („artykułu pięciuset sześciu”) nie jest używana: liczebnik główny zostaje w formie podstawowej (RJP: „do pokoju numer osiem”).
- Skróty ustaw typu „CIT/PIT/VAT” nie są rozwijane do pełnej nazwy ustawy.

## Źródła

- PWN Poradnia, „czytanie liczb wielocyfrowych” (M. Bańko): https://sjp.pwn.pl/poradnia/haslo/czytanie-liczb-wielocyfrowych;15986.html
- PWN Poradnia, „kropka a liczebniki porządkowe”: https://sjp.pwn.pl/poradnia/haslo/kropka-a-liczebniki-porzadkowe;14314.html
- PWN Poradnia, „Symbol paragrafu…”: https://sjp.pwn.pl/poradnia/haslo/symbol-paragrafu-i-wyroznienia-tytulow-aktow-prawnych;19239.html
- PWN Poradnia, „Zasady przywoływania aktów prawnych”, „Ze zmianami czy z późniejszymi zmianami”
- RJP, „Interpunkcja liczebników porządkowych…” (art. 20 = „dwudziesty”): https://rjp.pan.pl/interpunkcja-liczebnikow-porzadkowych-pisownia-i-odmiana-nazwy-umowa-zlecenie/
- RJP, „Liczebnik po słowie »numer«”: https://rjp.pan.pl/liczebnik-po-slowie-numer/
- RJP Komisja Języka Prawnego, „Przywoływanie ustaw i rozporządzeń”: https://rjp.pan.pl/przywolywanie-ustaw-i-rozporzadzen/
- Zasady techniki prawodawczej, § 57 (tiret, „bez względu na liczbę i przypadek”), § 59.
